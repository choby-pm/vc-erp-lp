import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { formatKRW } from "@/lib/format";
import type { ProgramStatus, Strategy } from "@/lib/labels";
import type { ProgramInput, TrackInput } from "@/lib/schemas/programs";

// 출자사업 공고 (R2-2, BR-PRG-01~03). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// 상태: draft(작성) → open(접수 중) → reviewing(심사 중) → closed(선정 완료). 되돌릴 수 없다

export type ProgramListItem = {
  id: string;
  name: string;
  status: ProgramStatus;
  budget_id: string;
  budget_year: number;
  apply_start_date: string;
  apply_end_date: string;
  apply_guide: string | null; // 접수 방법 안내 (공고 게시판, L51)
  track_count: number;
  planned_amount: number;
  proposal_count: number;
  selected_count: number;
};

export type Track = {
  id: string;
  name: string;
  strategy: Strategy;
  planned_amount: number;
  target_gp_count: number;
  min_fund_size_amount: number | null;
  max_commitment_ratio: number | null;
  proposal_count: number;
  selected_count: number;
  selected_amount: number;
};

export type ProgramDetail = ProgramListItem & { budget_total_amount: number; budget_remaining_amount: number; tracks: Track[] };

// 부문별 접수·선정 현황. 선정액은 선정 조건의 출자 예정액 (결재 승인된 것만)
const trackStats = sql`
  select t.program_id, t.id as track_id,
         count(p.id)::int as proposal_count,
         count(p.id) filter (where p.status = 'selected')::int as selected_count,
         coalesce(sum(s.planned_amount) filter (where p.status = 'selected'), 0)::bigint as selected_amount
  from program_tracks t
  left join proposals p on p.program_track_id = t.id
  left join selection_terms s on s.proposal_id = p.id
  group by t.program_id, t.id
`;

export async function listPrograms(orgId: string) {
  return sql<ProgramListItem[]>`
    select g.id, g.name, g.status, g.budget_id, b.budget_year, g.apply_start_date, g.apply_end_date, g.apply_guide,
           count(t.id)::int as track_count,
           coalesce(sum(t.planned_amount), 0)::bigint as planned_amount,
           coalesce(sum(st.proposal_count), 0)::int as proposal_count,
           coalesce(sum(st.selected_count), 0)::int as selected_count
    from programs g
    join budgets b on b.id = g.budget_id
    left join program_tracks t on t.program_id = g.id
    left join (${trackStats}) st on st.track_id = t.id
    where g.org_id = ${orgId}
    group by g.id, b.budget_year
    order by g.apply_start_date desc, g.created_at desc
  `;
}

export async function getProgram(orgId: string, programId: string): Promise<ProgramDetail> {
  assertUuid(programId, "출자사업을");
  const [program] = (await listPrograms(orgId)).filter((p) => p.id === programId);
  if (!program) throw notFound("출자사업을");
  const [budget] = await sql<{ total_amount: number; used_amount: number }[]>`
    select b.total_amount, coalesce(sum(u.used_amount), 0)::bigint as used_amount
    from budgets b left join v_budget_usage u on u.budget_id = b.id
    where b.id = ${program.budget_id} group by b.id
  `;
  const tracks = await sql<(Omit<Track, "max_commitment_ratio"> & { max_commitment_ratio: string | null })[]>`
    select t.id, t.name, t.strategy, t.planned_amount, t.target_gp_count, t.min_fund_size_amount, t.max_commitment_ratio,
           coalesce(st.proposal_count, 0) as proposal_count, coalesce(st.selected_count, 0) as selected_count,
           coalesce(st.selected_amount, 0)::bigint as selected_amount
    from program_tracks t left join (${trackStats}) st on st.track_id = t.id
    where t.program_id = ${programId} and t.org_id = ${orgId}
    order by t.created_at
  `;
  return {
    ...program,
    budget_total_amount: budget.total_amount,
    budget_remaining_amount: budget.total_amount - budget.used_amount,
    tracks: tracks.map((t) => ({ ...t, max_commitment_ratio: t.max_commitment_ratio === null ? null : Number(t.max_commitment_ratio) })),
  };
}

async function assertBudget(orgId: string, budgetId: string) {
  const [b] = await sql`select 1 from budgets where id = ${budgetId} and org_id = ${orgId}`;
  if (!b) throw new AppError(404, "NOT_FOUND", "예산을 찾을 수 없습니다", undefined, { fields: { budget_id: "예산을 찾을 수 없습니다" } });
}

// BR-PRG-02: 공고 전(작성 중)에만 사업 정보·부문을 바꿀 수 있다
async function loadDraft(orgId: string, programId: string) {
  assertUuid(programId, "출자사업을");
  const [p] = await sql<{ status: ProgramStatus }[]>`select status from programs where id = ${programId} and org_id = ${orgId}`;
  if (!p) throw notFound("출자사업을");
  if (p.status !== "draft") throw new AppError(409, "DOCUMENT_LOCKED", "공고한 출자사업은 조건을 바꿀 수 없습니다", "BR-PRG-02");
}

export async function createProgram(orgId: string, userId: string, input: ProgramInput) {
  await assertBudget(orgId, input.budget_id);
  const [p] = await sql<{ id: string }[]>`
    insert into programs (org_id, budget_id, name, apply_start_date, apply_end_date, apply_guide, created_by)
    values (${orgId}, ${input.budget_id}, ${input.name}, ${input.apply_start_date}, ${input.apply_end_date}, ${input.apply_guide}, ${userId})
    returning id
  `;
  return getProgram(orgId, p.id);
}

export async function updateProgram(orgId: string, programId: string, input: ProgramInput) {
  await loadDraft(orgId, programId);
  await assertBudget(orgId, input.budget_id);
  await sql`
    update programs set budget_id = ${input.budget_id}, name = ${input.name},
      apply_start_date = ${input.apply_start_date}, apply_end_date = ${input.apply_end_date}, apply_guide = ${input.apply_guide}
    where id = ${programId} and org_id = ${orgId}
  `;
  return getProgram(orgId, programId);
}

// 작성 중인 사업만 지울 수 있다 (공고 전에는 제안이 들어올 수 없다)
export async function deleteProgram(orgId: string, programId: string) {
  await loadDraft(orgId, programId);
  await sql.begin(async (tx) => {
    await tx`delete from program_tracks where program_id = ${programId} and org_id = ${orgId}`;
    await tx`delete from programs where id = ${programId} and org_id = ${orgId}`;
  });
  return { id: programId, deleted: true };
}

async function assertTrackNameFree(programId: string, name: string, exceptId?: string) {
  const [dup] = await sql`select 1 from program_tracks where program_id = ${programId} and name = ${name} ${exceptId ? sql`and id <> ${exceptId}` : sql``}`;
  if (dup) throw new AppError(409, "DUPLICATE_TRACK", "같은 이름의 모집 부문이 이미 있습니다", "BR-PRG-02", { fields: { name: "같은 이름의 부문이 있습니다" } });
}

export async function addTrack(orgId: string, programId: string, input: TrackInput) {
  await loadDraft(orgId, programId);
  await assertTrackNameFree(programId, input.name);
  await sql`
    insert into program_tracks (org_id, program_id, name, strategy, planned_amount, target_gp_count, min_fund_size_amount, max_commitment_ratio)
    values (${orgId}, ${programId}, ${input.name}, ${input.strategy}, ${input.planned_amount}, ${input.target_gp_count},
            ${input.min_fund_size_amount}, ${input.max_commitment_ratio})
  `;
  return getProgram(orgId, programId);
}

async function loadTrack(orgId: string, programId: string, trackId: string) {
  assertUuid(trackId, "모집 부문을");
  const [t] = await sql`select 1 from program_tracks where id = ${trackId} and program_id = ${programId} and org_id = ${orgId}`;
  if (!t) throw notFound("모집 부문을");
}

export async function updateTrack(orgId: string, programId: string, trackId: string, input: TrackInput) {
  await loadDraft(orgId, programId);
  await loadTrack(orgId, programId, trackId);
  await assertTrackNameFree(programId, input.name, trackId);
  await sql`
    update program_tracks set name = ${input.name}, strategy = ${input.strategy}, planned_amount = ${input.planned_amount},
      target_gp_count = ${input.target_gp_count}, min_fund_size_amount = ${input.min_fund_size_amount},
      max_commitment_ratio = ${input.max_commitment_ratio}
    where id = ${trackId} and org_id = ${orgId}
  `;
  return getProgram(orgId, programId);
}

export async function deleteTrack(orgId: string, programId: string, trackId: string) {
  await loadDraft(orgId, programId);
  await loadTrack(orgId, programId, trackId);
  await sql`delete from program_tracks where id = ${trackId} and org_id = ${orgId}`;
  return getProgram(orgId, programId);
}

// ─── 상태 이동 (BR-PRG-01) ──────────────────────────────────────────────────

const moveError = (message: string, code = "INVALID_STATUS_TRANSITION") => new AppError(409, code, message, "BR-PRG-01");

async function move(orgId: string, programId: string, from: ProgramStatus, to: ProgramStatus) {
  const [p] = await sql`
    update programs set status = ${to} where id = ${programId} and org_id = ${orgId} and status = ${from} returning id
  `;
  if (!p) throw moveError(`지금 상태에서는 할 수 없습니다`);
}

// 공고: 부문 1개 이상. 부문 예정액 합계가 예산 잔액을 넘으면 경고만 (BR-PRG-03, 실제 차단은 선정 때)
export async function openProgram(orgId: string, programId: string) {
  const program = await getProgram(orgId, programId);
  if (program.status !== "draft") throw moveError("작성 중인 출자사업만 공고할 수 있습니다");
  if (program.tracks.length === 0) throw new AppError(422, "TRACK_REQUIRED", "모집 부문을 1개 이상 만드세요", "BR-PRG-01");
  await move(orgId, programId, "draft", "open");
  const warnings: string[] = [];
  if (program.planned_amount > program.budget_remaining_amount) {
    warnings.push(`부문 출자 예정액 합계(${formatKRW(program.planned_amount)})가 ${program.budget_year}년 예산 잔액(${formatKRW(program.budget_remaining_amount)})을 넘습니다. 선정할 때 예산 잔액으로 다시 검사합니다`);
  }
  return { ...(await getProgram(orgId, programId)), warnings };
}

// 접수 마감 → 심사 시작. 접수 종료일 전이라도 담당자가 마감할 수 있다
export async function startReview(orgId: string, programId: string) {
  const program = await getProgram(orgId, programId);
  if (program.status !== "open") throw moveError("접수 중인 출자사업만 심사를 시작할 수 있습니다");
  await move(orgId, programId, "open", "reviewing");
  return getProgram(orgId, programId);
}

// 선정 완료: 접수된 제안이 모두 결정됐고(선정·탈락·철회) 선정 결재 대기가 없어야 한다
export async function closeProgram(orgId: string, programId: string) {
  const program = await getProgram(orgId, programId);
  if (program.status !== "reviewing") throw moveError("심사 중인 출자사업만 선정 완료할 수 있습니다");
  const [open] = await sql<{ undecided: number; pending: number }[]>`
    select count(*) filter (where p.status not in ('selected', 'rejected', 'withdrawn'))::int as undecided,
           count(a.id)::int as pending
    from program_tracks t
    join proposals p on p.program_track_id = t.id
    left join approvals a on a.target_type = 'selection' and a.target_id = p.id and a.status = 'pending'
    where t.program_id = ${programId}
  `;
  if (open.undecided > 0 || open.pending > 0) {
    throw new AppError(409, "PROGRAM_HAS_OPEN_PROPOSALS", `결정하지 않은 제안 ${open.undecided}건${open.pending ? `, 선정 결재 대기 ${open.pending}건` : ""}이 남아 있습니다`, "BR-PRG-01", open);
  }
  await move(orgId, programId, "reviewing", "closed");
  return getProgram(orgId, programId);
}
