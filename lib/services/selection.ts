import type postgres from "postgres";
import { sql } from "@/lib/db";
import { responseDueSet } from "@/lib/gp/responses";
import { AppError, notFound } from "@/lib/api/errors";
import { formatKRW } from "@/lib/format";
import { FINAL_PROPOSAL_STATUSES, STRATEGY_LABEL, type Strategy } from "@/lib/labels";
import type { SelectionTermsInput } from "@/lib/schemas/approvals";
import { getProposal, type ProposalDetail } from "./proposals";

// 선정 조건 · 선정 점검 · 선정 결재 기안 · 승인 시 선정 처리 (R2-4, BR-SEL-01~04, BR-BUD-04·05, BR-PRG-05)
// 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)

type Tx = postgres.TransactionSql | typeof sql;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export type SelectionTerms = {
  id: string;
  budget_id: string;
  budget_year: number;
  planned_amount: number;
  max_commitment_ratio: number | null;
  formation_deadline: string;
  key_person_condition: string | null;
  locked_at: Date | null;
};

export async function getSelectionTerms(orgId: string, proposalId: string): Promise<SelectionTerms | null> {
  const [t] = await sql<(Omit<SelectionTerms, "max_commitment_ratio"> & { max_commitment_ratio: string | null })[]>`
    select s.id, s.budget_id, b.budget_year, s.planned_amount, s.max_commitment_ratio, s.formation_deadline, s.key_person_condition, s.locked_at
    from selection_terms s join budgets b on b.id = s.budget_id
    where s.proposal_id = ${proposalId} and s.org_id = ${orgId}
  `;
  return t ? { ...t, max_commitment_ratio: t.max_commitment_ratio === null ? null : Number(t.max_commitment_ratio) } : null;
}

// 공고형이면 예산은 출자사업의 예산으로 고정한다 (BR-SEL-01)
async function programBudgetOf(proposal: ProposalDetail) {
  if (!proposal.program_id) return null;
  const [p] = await sql<{ budget_id: string }[]>`select budget_id from programs where id = ${proposal.program_id}`;
  return p.budget_id;
}

// BR-SEL-01: 끝 상태가 아니고, 결재 대기·승인(잠김)이 아닐 때 작성·수정한다
export async function putSelectionTerms(orgId: string, userId: string, proposalId: string, input: SelectionTermsInput) {
  const p = await getProposal(orgId, proposalId);
  if ((FINAL_PROPOSAL_STATUSES as readonly string[]).includes(p.status)) throw new AppError(409, "PROPOSAL_CLOSED", "이미 결정된 제안입니다", "BR-SEL-01");
  if (p.pending_approval) throw new AppError(409, "APPROVAL_PENDING", "선정 결재 대기 중이라 선정 조건을 바꿀 수 없습니다", "BR-APR-03");

  const programBudget = await programBudgetOf(p);
  if (programBudget && programBudget !== input.budget_id) {
    throw new AppError(422, "VALIDATION_ERROR", "공고형 제안은 출자사업의 예산으로만 선정합니다", "BR-SEL-01", { fields: { budget_id: "출자사업의 예산 연도를 고르세요" } });
  }
  const [budget] = await sql`select 1 from budgets where id = ${input.budget_id} and org_id = ${orgId}`;
  if (!budget) throw new AppError(404, "NOT_FOUND", "예산을 찾을 수 없습니다", undefined, { fields: { budget_id: "예산을 찾을 수 없습니다" } });
  if (input.planned_amount > p.requested_amount) {
    throw new AppError(422, "PLANNED_EXCEEDS_REQUESTED", `출자 예정액이 요청 출자액(${formatKRW(p.requested_amount)})을 넘습니다`, "BR-SEL-01", { fields: { planned_amount: "요청 출자액 이하로 입력하세요" } });
  }
  if (input.formation_deadline <= today()) {
    throw new AppError(422, "INVALID_DATE", "결성 기한은 오늘 이후여야 합니다", "BR-SEL-01", { fields: { formation_deadline: "오늘 이후 날짜를 입력하세요" } });
  }

  await sql`
    insert into selection_terms (org_id, proposal_id, budget_id, planned_amount, max_commitment_ratio, formation_deadline, key_person_condition, created_by)
    values (${orgId}, ${proposalId}, ${input.budget_id}, ${input.planned_amount}, ${input.max_commitment_ratio}, ${input.formation_deadline},
            ${input.key_person_condition}, ${userId})
    on conflict (proposal_id) do update set budget_id = excluded.budget_id, planned_amount = excluded.planned_amount,
      max_commitment_ratio = excluded.max_commitment_ratio, formation_deadline = excluded.formation_deadline,
      key_person_condition = excluded.key_person_condition
  `;
  return getSelectionTerms(orgId, proposalId);
}

// ─── 선정 점검 (BR-SEL-02, BR-BUD-04·05, BR-PRG-05) ──────────────────────────

export type Check = { rule: string; label: string; ok: boolean; message?: string; warning?: boolean };
export type SelectionCheck = {
  can_request: boolean;
  checks: Check[];
  warnings: string[];
  numbers: {
    budget_year: number | null;
    budget_total: number;
    budget_used_by_others: number;
    planned_amount: number;
    track_planned: number | null;
    track_used_by_others: number;
    strategy: Strategy;
    strategy_allocated: number;
    strategy_used_by_others: number;
    evaluation_count: number;
    avg_score: number | null;
  };
};

// 이 제안을 뺀 "다른" 선정 금액: 선정 승인(취소 안 된 것) + 선정 결재 대기 (BR-BUD-03)
const othersUsing = (tx: Tx, proposalId: string) => tx`
  select s.planned_amount, s.budget_id, p.program_track_id, f.strategy
  from selection_terms s
  join proposals p on p.id = s.proposal_id
  join funds f on f.id = p.fund_id
  left join commitments m on m.proposal_id = p.id
  where s.proposal_id <> ${proposalId}
    and ((p.status = 'selected' and coalesce(m.status, '') <> 'cancelled')
         or exists (select 1 from approvals a where a.target_type = 'selection' and a.target_id = p.id and a.status = 'pending'))
`;

// tx 로 부르면 예산 행을 잠근 상태에서 계산한다 (기안·승인 때, BR-COM-02)
export async function selectionCheck(orgId: string, proposalId: string, tx: Tx = sql, lock = false): Promise<SelectionCheck> {
  const p = await getProposal(orgId, proposalId);
  const terms = await getSelectionTerms(orgId, proposalId);
  const checks: Check[] = [];
  const warnings: string[] = [];

  const isFinal = (FINAL_PROPOSAL_STATUSES as readonly string[]).includes(p.status);
  checks.push({ rule: "BR-PROP-04", label: "심사 중인 제안", ok: !isFinal, message: isFinal ? "이미 결정된 제안입니다" : undefined });
  checks.push({ rule: "BR-APR-02", label: "진행 중인 선정 결재 없음", ok: !p.pending_approval, message: p.pending_approval ? "결재 대기 중입니다" : undefined });
  checks.push({ rule: "BR-SEL-01", label: "선정 조건 작성", ok: Boolean(terms), message: terms ? undefined : "선정 조건을 먼저 저장하세요" });

  const [ev] = await sql<{ n: number }[]>`select count(*)::int as n from evaluations where proposal_id = ${proposalId}`;
  checks.push({ rule: "BR-SEL-02", label: "심사 평가 1건 이상", ok: ev.n > 0, message: ev.n > 0 ? `${ev.n}건` : "평가표가 없습니다" });

  let budgetTotal = 0;
  let others: { planned_amount: number; budget_id: string; program_track_id: string | null; strategy: Strategy }[] = [];
  let trackPlanned: number | null = null;
  let trackTarget = 0;
  let allocated = 0;
  if (terms) {
    checks.push({ rule: "BR-SEL-01", label: "결성 기한이 오늘 이후", ok: terms.formation_deadline > today(), message: terms.formation_deadline > today() ? undefined : "결성 기한이 지났습니다. 선정 조건을 고치세요" });
    checks.push({ rule: "BR-SEL-01", label: "출자 예정액 ≤ 요청 출자액", ok: terms.planned_amount <= p.requested_amount });

    const [b] = lock
      ? await tx<{ total_amount: number }[]>`select total_amount from budgets where id = ${terms.budget_id} for update`
      : await tx<{ total_amount: number }[]>`select total_amount from budgets where id = ${terms.budget_id}`;
    budgetTotal = b.total_amount;
    others = (await othersUsing(tx, proposalId)) as never;
    const usedBudget = others.filter((o) => o.budget_id === terms.budget_id).reduce((s, o) => s + Number(o.planned_amount), 0);
    const remaining = budgetTotal - usedBudget;
    checks.push({
      rule: "BR-BUD-04",
      label: `${terms.budget_year}년 예산 잔액`,
      ok: terms.planned_amount <= remaining,
      message: `잔액 ${formatKRW(remaining)} / 이번 ${formatKRW(terms.planned_amount)}`,
    });

    // 분야별 배분은 넘어도 경고만 (BR-BUD-05)
    const [alloc] = await tx<{ amount: number }[]>`select amount from budget_allocations where budget_id = ${terms.budget_id} and strategy = ${p.strategy}`;
    allocated = alloc?.amount ?? 0;
    const usedStrategy = others.filter((o) => o.budget_id === terms.budget_id && o.strategy === p.strategy).reduce((s, o) => s + Number(o.planned_amount), 0);
    if (allocated > 0 && usedStrategy + terms.planned_amount > allocated) {
      warnings.push(`${STRATEGY_LABEL[p.strategy]} 분야 배분(${formatKRW(allocated)})을 넘습니다 — 선정 후 ${formatKRW(usedStrategy + terms.planned_amount)} (경고만, BR-BUD-05)`);
    }

    // 공고형: 부문 출자 예정액은 막고, 선정 GP 수는 경고만 (BR-PRG-05)
    if (p.program_track_id) {
      const [t] = await tx<{ planned_amount: number; target_gp_count: number }[]>`select planned_amount, target_gp_count from program_tracks where id = ${p.program_track_id}`;
      trackPlanned = t.planned_amount;
      trackTarget = t.target_gp_count;
      const inTrack = others.filter((o) => o.program_track_id === p.program_track_id);
      const usedTrack = inTrack.reduce((s, o) => s + Number(o.planned_amount), 0);
      checks.push({
        rule: "BR-PRG-05",
        label: `모집 부문 출자 예정액 (${p.track_name})`,
        ok: usedTrack + terms.planned_amount <= t.planned_amount,
        message: `부문 잔여 ${formatKRW(t.planned_amount - usedTrack)} / 이번 ${formatKRW(terms.planned_amount)}`,
      });
      if (inTrack.length + 1 > t.target_gp_count) warnings.push(`${p.track_name}의 선정 GP 수(${t.target_gp_count}곳)를 넘습니다 — 선정 후 ${inTrack.length + 1}곳 (경고만)`);
    }
    if (terms.max_commitment_ratio !== null && p.target_amount) {
      const ratio = terms.planned_amount / p.target_amount;
      if (ratio > terms.max_commitment_ratio) {
        warnings.push(`목표 결성액 기준 출자 비율 ${(ratio * 100).toFixed(1)}%가 상한 ${(terms.max_commitment_ratio * 100).toFixed(1)}%를 넘습니다. 결성 확인 때 실제 결성액으로 다시 검사합니다`);
      }
    }
  }
  void trackTarget;

  return {
    can_request: checks.every((c) => c.ok),
    checks,
    warnings,
    numbers: {
      budget_year: terms?.budget_year ?? null,
      budget_total: budgetTotal,
      budget_used_by_others: terms ? others.filter((o) => o.budget_id === terms.budget_id).reduce((s, o) => s + Number(o.planned_amount), 0) : 0,
      planned_amount: terms?.planned_amount ?? 0,
      track_planned: trackPlanned,
      track_used_by_others: p.program_track_id ? others.filter((o) => o.program_track_id === p.program_track_id).reduce((s, o) => s + Number(o.planned_amount), 0) : 0,
      strategy: p.strategy,
      strategy_allocated: allocated,
      strategy_used_by_others: terms ? others.filter((o) => o.budget_id === terms.budget_id && o.strategy === p.strategy).reduce((s, o) => s + Number(o.planned_amount), 0) : 0,
      evaluation_count: ev.n,
      avg_score: p.avg_score,
    },
  };
}

// 점검에서 실패한 첫 규칙을 오류로 바꾼다 (화면 없이 API로 부른 경우에도 같은 판정)
function failOf(check: SelectionCheck) {
  const bad = check.checks.find((c) => !c.ok);
  if (!bad) return null;
  const code: Record<string, [number, string]> = {
    "BR-PROP-04": [409, "PROPOSAL_CLOSED"],
    "BR-APR-02": [409, "APPROVAL_PENDING"],
    "BR-SEL-01": [422, "SELECTION_TERMS_INVALID"],
    "BR-SEL-02": [422, "EVALUATION_REQUIRED"],
    "BR-BUD-04": [422, "BUDGET_EXCEEDED"],
    "BR-PRG-05": [422, "TRACK_AMOUNT_EXCEEDED"],
  };
  const [status, errCode] = code[bad.rule] ?? [422, "SELECTION_CHECK_FAILED"];
  return new AppError(status, errCode, `${bad.label}: ${bad.message ?? "조건을 채우지 못했습니다"}`, bad.rule, { checks: check.checks });
}

// 선정 결재 기안 (BR-SEL-02, BR-APR-01~04). 예산 행을 잠그고 검사한 뒤 결재를 만든다
export async function requestSelection(orgId: string, userId: string, proposalId: string, comment: string | null) {
  const p = await getProposal(orgId, proposalId);
  const approvalId = await sql.begin(async (tx) => {
    const check = await selectionCheck(orgId, proposalId, tx, true);
    const err = failOf(check);
    if (err) throw err;
    const terms = (await getSelectionTerms(orgId, proposalId))!;
    const snapshot = {
      proposal: { fund_name: p.fund_name, gp_name: p.gp_name, requested_amount: p.requested_amount, channel: p.proposal_channel, program_name: p.program_name, track_name: p.track_name, received_date: p.received_date },
      terms: { budget_year: terms.budget_year, planned_amount: terms.planned_amount, max_commitment_ratio: terms.max_commitment_ratio, formation_deadline: terms.formation_deadline, key_person_condition: terms.key_person_condition },
      numbers: check.numbers,
      warnings: check.warnings,
    };
    const [a] = await tx<{ id: string }[]>`
      insert into approvals (org_id, target_type, target_id, requested_by, request_comment, snapshot)
      values (${orgId}, 'selection', ${proposalId}, ${userId}, ${comment}, ${tx.json(snapshot as never)})
      returning id
    `;
    return a.id;
  });
  return { approval_id: approvalId, proposal: await getProposal(orgId, proposalId) };
}

// 선정 결재 승인 시 (BR-SEL-03). approvals 서비스의 트랜잭션 안에서 부른다
export async function applySelectionApproval(tx: postgres.TransactionSql, orgId: string, approverId: string, proposalId: string) {
  // 1. 예산·부문 한도 다시 검사 (예산 행 잠금) — 기안 뒤 다른 선정이 먼저 승인됐을 수 있다
  const check = await selectionCheck(orgId, proposalId, tx, true);
  const hard = check.checks.filter((c) => c.rule === "BR-BUD-04" || c.rule === "BR-PRG-05" || c.rule === "BR-SEL-01");
  const bad = hard.find((c) => !c.ok);
  if (bad) {
    const code = bad.rule === "BR-BUD-04" ? "BUDGET_EXCEEDED" : bad.rule === "BR-PRG-05" ? "TRACK_AMOUNT_EXCEEDED" : "SELECTION_TERMS_INVALID";
    throw new AppError(422, code, `승인할 수 없습니다 — ${bad.label}: ${bad.message ?? ""}. 반려하고 조건을 고쳐 다시 올리세요`, bad.rule);
  }
  const [p] = await tx<{ status: string; fund_id: string }[]>`select status, fund_id from proposals where id = ${proposalId} and org_id = ${orgId} for update`;
  if (!p) throw notFound("출자 제안을");
  if ((FINAL_PROPOSAL_STATUSES as readonly string[]).includes(p.status)) throw new AppError(409, "PROPOSAL_CLOSED", "이미 결정된 제안입니다", "BR-PROP-04");

  // 2. 제안 → 선정, 결정일 = 승인일 · 3. 선정 조건 잠금 · 4. 출자 건 생성
  const decided = today();
  await tx`update proposals set status = 'selected', decided_date = ${decided}, ${responseDueSet("selected")} where id = ${proposalId}`;
  await tx`
    insert into proposal_stage_history (org_id, proposal_id, from_status, to_status, note, changed_by)
    values (${orgId}, ${proposalId}, ${p.status}, 'selected', '선정 결재 승인', ${approverId})
  `;
  await tx`update selection_terms set locked_at = now() where proposal_id = ${proposalId}`;
  const [c] = await tx<{ id: string }[]>`
    insert into commitments (org_id, fund_id, proposal_id) values (${orgId}, ${p.fund_id}, ${proposalId}) returning id
  `;
  // 5. 연동 제안이면 트랜잭션 후 GP에 확약을 전달한다 (approve() 에서, BR-PROP-06)
  return { commitment_id: c.id, decided_date: decided };
}
