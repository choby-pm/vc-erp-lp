import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { FINAL_PROPOSAL_STATUSES, PROPOSAL_STATUS_LABEL, type EvaluationStage, type ProposalStatus } from "@/lib/labels";
import type { CriterionInput, EvaluationInput } from "@/lib/schemas/proposals";
import { getProposal } from "./proposals";

// 평가 항목 · 심사 평가표 (R2-3, BR-EVAL-01~05). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)

export type Criterion = { id: string; name: string; weight_ratio: number; sort_order: number; retired_at: Date | null; used_count: number };

export async function listCriteria(orgId: string, includeRetired = false) {
  const rows = await sql<(Omit<Criterion, "weight_ratio"> & { weight_ratio: string })[]>`
    select c.id, c.name, c.weight_ratio, c.sort_order, c.retired_at,
           (select count(*)::int from evaluation_scores s where s.criterion_id = c.id) as used_count
    from evaluation_criteria c
    where c.org_id = ${orgId} ${includeRetired ? sql`` : sql`and c.retired_at is null`}
    order by c.retired_at is not null, c.sort_order, c.created_at
  `;
  return rows.map((r) => ({ ...r, weight_ratio: Number(r.weight_ratio) }));
}

// 사용 중인 항목의 가중치 합계 (1이어야 평가할 수 있다)
export function weightSum(criteria: { weight_ratio: number; retired_at: Date | null }[]) {
  return Number(criteria.filter((c) => !c.retired_at).reduce((s, c) => s + c.weight_ratio, 0).toFixed(6));
}

async function assertNameFree(orgId: string, name: string, exceptId?: string) {
  const [dup] = await sql`select 1 from evaluation_criteria where org_id = ${orgId} and name = ${name} and retired_at is null ${exceptId ? sql`and id <> ${exceptId}` : sql``}`;
  if (dup) throw new AppError(409, "DUPLICATE_CRITERION", "같은 이름의 평가 항목이 이미 있습니다", "BR-EVAL-01", { fields: { name: "같은 이름의 항목이 있습니다" } });
}

export async function createCriterion(orgId: string, input: CriterionInput) {
  await assertNameFree(orgId, input.name);
  await sql`insert into evaluation_criteria (org_id, name, weight_ratio, sort_order) values (${orgId}, ${input.name}, ${input.weight_ratio}, ${input.sort_order})`;
  return listCriteria(orgId, true);
}

// 가중치를 바꿔도 이미 쓴 평가표는 평가 당시 가중치로 계산된다 (점수 행에 복사, 03 원칙 6)
export async function updateCriterion(orgId: string, criterionId: string, input: CriterionInput) {
  assertUuid(criterionId, "평가 항목을");
  const [c] = await sql<{ retired_at: Date | null }[]>`select retired_at from evaluation_criteria where id = ${criterionId} and org_id = ${orgId}`;
  if (!c) throw notFound("평가 항목을");
  if (c.retired_at) throw new AppError(409, "DOCUMENT_LOCKED", "은퇴한 평가 항목은 바꿀 수 없습니다", "BR-EVAL-01");
  await assertNameFree(orgId, input.name, criterionId);
  await sql`update evaluation_criteria set name = ${input.name}, weight_ratio = ${input.weight_ratio}, sort_order = ${input.sort_order} where id = ${criterionId}`;
  return listCriteria(orgId, true);
}

// 은퇴: 더 이상 새 평가에 쓰지 않는다. 과거 평가표의 점수는 남는다 (BR-EVAL-01)
export async function retireCriterion(orgId: string, criterionId: string) {
  assertUuid(criterionId, "평가 항목을");
  const [c] = await sql`update evaluation_criteria set retired_at = now() where id = ${criterionId} and org_id = ${orgId} and retired_at is null returning id`;
  if (!c) throw notFound("평가 항목을");
  return listCriteria(orgId, true);
}

// ─── 평가표 ─────────────────────────────────────────────────────────────────

export type EvaluationRow = {
  id: string;
  stage: EvaluationStage;
  evaluator_id: string;
  evaluator_name: string;
  evaluated_date: string;
  opinion: string | null;
  weighted_score: number;
  scores: { criterion_id: string; criterion_name: string; weight_ratio: number; score: number }[];
};

export async function listEvaluations(orgId: string, proposalId: string) {
  await getProposal(orgId, proposalId); // 다른 기관 제안이면 여기서 "없음"
  const rows = await sql<EvaluationRow[]>`
    select e.id, e.stage, e.evaluator_id, u.name as evaluator_name, e.evaluated_date, e.opinion,
           round(sum(s.score * s.weight_ratio), 1)::float as weighted_score,
           json_agg(json_build_object('criterion_id', s.criterion_id, 'criterion_name', s.criterion_name,
                                      'weight_ratio', s.weight_ratio::float, 'score', s.score) order by c.sort_order, c.created_at) as scores
    from evaluations e
    join users u on u.id = e.evaluator_id
    join evaluation_scores s on s.evaluation_id = e.id
    join evaluation_criteria c on c.id = s.criterion_id
    where e.proposal_id = ${proposalId} and e.org_id = ${orgId}
    group by e.id, u.name
    order by e.stage, e.evaluated_date, u.name
  `;
  // 단계별 평균과 전체 평균 (BR-EVAL-05). 점수로 자동 선정·탈락하지 않는다
  const byStage: Record<string, { count: number; avg: number }> = {};
  for (const r of rows) {
    const s = (byStage[r.stage] ??= { count: 0, avg: 0 });
    s.avg = (s.avg * s.count + r.weighted_score) / (s.count + 1);
    s.count += 1;
  }
  const overall = rows.length ? rows.reduce((s, r) => s + r.weighted_score, 0) / rows.length : null;
  return {
    evaluations: rows,
    stage_averages: Object.entries(byStage).map(([stage, v]) => ({ stage, count: v.count, avg_score: Number(v.avg.toFixed(1)) })),
    overall_avg: overall === null ? null : Number(overall.toFixed(1)),
  };
}

// 내 평가표 저장 (BR-EVAL-01~04). 심사위원 × 단계당 하나, 다시 저장하면 고친다
export async function saveMyEvaluation(orgId: string, userId: string, proposalId: string, stage: EvaluationStage, input: EvaluationInput) {
  const p = await getProposal(orgId, proposalId);
  if ((FINAL_PROPOSAL_STATUSES as readonly string[]).includes(p.status)) {
    throw new AppError(409, "DOCUMENT_LOCKED", `${PROPOSAL_STATUS_LABEL[p.status as ProposalStatus]}된 제안의 평가표는 바꿀 수 없습니다`, "BR-EVAL-04");
  }
  if (!p.evaluable_stages.includes(stage)) {
    throw new AppError(422, "INVALID_EVALUATION_STAGE", "아직 거치지 않은 심사 단계는 평가할 수 없습니다", "BR-EVAL-03");
  }

  const criteria = await listCriteria(orgId);
  if (weightSum(criteria) !== 1) {
    throw new AppError(422, "CRITERIA_WEIGHT_INVALID", `평가 항목 가중치 합계가 100%가 아닙니다 (${(weightSum(criteria) * 100).toFixed(1)}%). 관리자에게 평가 항목 정리를 요청하세요`, "BR-EVAL-01");
  }
  const given = new Map(input.scores.map((s) => [s.criterion_id, s.score]));
  const missing = criteria.filter((c) => !given.has(c.id));
  if (missing.length) {
    throw new AppError(422, "SCORE_MISSING", `모든 항목에 점수를 입력하세요 (빠진 항목: ${missing.map((c) => c.name).join(", ")})`, "BR-EVAL-02");
  }
  if (input.scores.some((s) => !criteria.some((c) => c.id === s.criterion_id))) {
    throw new AppError(422, "INVALID_SCORE", "사용 중이 아닌 평가 항목이 들어 있습니다", "BR-EVAL-02");
  }
  const evaluatedDate = input.evaluated_date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  await sql.begin(async (tx) => {
    const [e] = await tx<{ id: string }[]>`
      insert into evaluations (org_id, proposal_id, evaluator_id, stage, evaluated_date, opinion)
      values (${orgId}, ${proposalId}, ${userId}, ${stage}, ${evaluatedDate}, ${input.opinion})
      on conflict (proposal_id, evaluator_id, stage) do update set evaluated_date = excluded.evaluated_date, opinion = excluded.opinion
      returning id
    `;
    await tx`delete from evaluation_scores where evaluation_id = ${e.id}`;
    for (const c of criteria) {
      await tx`
        insert into evaluation_scores (org_id, evaluation_id, criterion_id, criterion_name, weight_ratio, score)
        values (${orgId}, ${e.id}, ${c.id}, ${c.name}, ${c.weight_ratio}, ${given.get(c.id)!})
      `;
    }
  });
  return listEvaluations(orgId, proposalId);
}
