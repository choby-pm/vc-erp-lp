import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { formatKRW } from "@/lib/format";
import type { CallPaymentStatus, DataSource } from "@/lib/labels";
import { getCommitment } from "@/lib/services/commitments";
import type { CapitalCallCreateInput, CapitalCallListQuery } from "@/lib/schemas/capital-calls";

// 캐피탈콜 (R4-1, BR-CALL-01~05). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 연동: GP가 발송한 캐피탈콜이 들어온다. 회차·금액·기한은 GP 값 (BR-CALL-01, BR-COM-05). 회차로 맞춘다 (GP API가 ID 대신 회차를 준다)
// · 수기: 담당자가 입력. 요청액 ≤ 남은 약정 (BR-CALL-02·03)
// · 우리 쪽 납입 상태는 저장하지 않고 납입(payments)에서 계산한다 (v_capital_call_status, BR-CALL-05)
// · GP가 본 우리 납입 상태·금액(gp_payment_status, gp_paid_amount)은 따로 둔다 → "우리는 보냈는데 GP는 미납"

type Db = typeof sql;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export type CapitalCallItem = {
  id: string;
  commitment_id: string;
  fund_id: string;
  fund_name: string;
  gp_name: string;
  call_no: number;
  is_initial: boolean;
  call_date: string;
  due_date: string;
  call_amount: number;
  purpose: string | null;
  data_source: DataSource;
  gp_payment_status: string | null;
  gp_paid_amount: number | null;
  cancelled_at: Date | null;
  paid_amount: number; // 우리 송금 완료 합계
  pending_amount: number; // 결재 대기 + 송금 대기
  payment_status: CallPaymentStatus; // 우리 쪽 납입 상태 (계산값)
  over_commitment: boolean; // 연동: 요청 합계가 약정을 넘음 (BR-CALL-03, 받아들이되 표시)
};

const listQuery = (db: Db, orgId: string) => db`
  select c.id, c.commitment_id, m.fund_id, f.name as fund_name, g.name as gp_name, c.call_no, c.is_initial, c.call_date, c.due_date,
         c.call_amount, c.purpose, c.data_source, c.gp_payment_status, c.gp_paid_amount, c.cancelled_at,
         s.paid_amount, s.pending_amount,
         case when c.cancelled_at is null and s.payment_status <> 'paid' and ${today()}::date > c.due_date then 'overdue' else s.payment_status end as payment_status,
         (c.data_source = 'gp_api' and sm.called_amount > sm.commitment_amount and sm.commitment_amount > 0) as over_commitment
  from capital_calls c
  join v_capital_call_status s on s.capital_call_id = c.id
  join commitments m on m.id = c.commitment_id
  join funds f on f.id = m.fund_id
  join gps g on g.id = f.gp_id
  join v_commitment_summary sm on sm.commitment_id = c.commitment_id
  where c.org_id = ${orgId}
`;

// 전체 캐피탈콜 (미납 = 아직 다 내지 않은 것, 기한 경과 = 미납 중 기한이 지난 것)
export async function listCapitalCalls(orgId: string, q: CapitalCallListQuery = {}) {
  const status = q.status ?? "unpaid";
  return sql<CapitalCallItem[]>`
    select * from (${listQuery(sql, orgId)}) x
    where ${status === "all" ? sql`true` : status === "overdue" ? sql`x.payment_status = 'overdue'` : sql`x.cancelled_at is null and x.payment_status <> 'paid'`}
      ${q.commitment_id ? sql`and x.commitment_id = ${q.commitment_id}` : sql``}
    order by ${status === "all" ? sql`x.call_date desc, x.call_no desc` : sql`x.due_date, x.fund_name`}
  `;
}

export async function listCallsForCommitment(orgId: string, commitmentId: string) {
  return sql<CapitalCallItem[]>`select * from (${listQuery(sql, orgId)}) x where x.commitment_id = ${commitmentId} order by x.call_no desc`;
}

export async function getCapitalCall(orgId: string, callId: string, db: Db = sql): Promise<CapitalCallItem> {
  assertUuid(callId, "캐피탈콜을");
  const [c] = await db<CapitalCallItem[]>`select * from (${listQuery(db, orgId)}) x where x.id = ${callId}`;
  if (!c) throw notFound("캐피탈콜을");
  return c;
}

// ─── 수기 등록 · 취소 (BR-CALL-02~04) ───────────────────────────────────────

// 수기 조합의 활성 출자 건만. 회차를 비우면 다음 회차. 요청액 ≤ 남은 약정 (약정 − 취소되지 않은 요청 합계)
export async function createManualCall(orgId: string, userId: string, commitmentId: string, input: CapitalCallCreateInput) {
  const id = await sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    await tx`select id from commitments where id = ${commitmentId} and org_id = ${orgId} for update`; // BR-COM-02: 한도 검사 동시성
    const c = await getCommitment(orgId, commitmentId, t);
    if (c.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 조합의 캐피탈콜은 GP에서 자동으로 들어옵니다", "BR-CALL-01");
    if (c.status !== "active") throw new AppError(409, "COMMITMENT_NOT_ACTIVE", "결성 확인된(활성) 출자 건에만 캐피탈콜을 등록할 수 있습니다", "BR-CMT-07");
    if (input.due_date < input.call_date) {
      throw new AppError(422, "INVALID_DATE", "납입 기한은 요청일 이후여야 합니다", "BR-CALL-02", { fields: { due_date: "요청일 이후 날짜를 입력하세요" } });
    }
    const [s] = await tx<{ unfunded_amount: number }[]>`select unfunded_amount from v_commitment_summary where commitment_id = ${commitmentId}`;
    if (input.call_amount > s.unfunded_amount) {
      const message = `요청액이 남은 약정액(${formatKRW(s.unfunded_amount)})을 넘습니다`;
      throw new AppError(422, "CALL_EXCEEDS_UNFUNDED", message, "BR-CALL-03", { fields: { call_amount: message } });
    }
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(call_no), 0) + 1 as next from capital_calls where commitment_id = ${commitmentId}`;
    const callNo = input.call_no ?? next;
    const [dup] = await tx`select 1 from capital_calls where commitment_id = ${commitmentId} and call_no = ${callNo}`;
    if (dup) throw new AppError(409, "DUPLICATE_CALL_NO", `${callNo}회 캐피탈콜이 이미 있습니다`, "BR-CALL-02", { fields: { call_no: `다음 회차는 ${next}회입니다` } });
    const [row] = await tx<{ id: string }[]>`
      insert into capital_calls (org_id, commitment_id, call_no, is_initial, call_date, due_date, call_amount, purpose, data_source, created_by)
      values (${orgId}, ${commitmentId}, ${callNo}, ${callNo === 1}, ${input.call_date}, ${input.due_date}, ${input.call_amount}, ${input.purpose}, 'manual', ${userId})
      returning id
    `;
    return row.id;
  });
  return getCapitalCall(orgId, id);
}

// 수기 캐피탈콜 취소: 송금한 납입이 있으면 불가. 결재 대기·송금 대기 납입은 함께 취소, 걸린 결재도 반려 처리 (BR-CALL-04)
export async function cancelManualCall(orgId: string, callId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    const c = await getCapitalCall(orgId, callId, t);
    await tx`select id from capital_calls where id = ${callId} for update`;
    if (c.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 캐피탈콜은 GP에서만 취소할 수 있습니다", "BR-CALL-04");
    if (c.cancelled_at) throw new AppError(409, "INVALID_STATE", "이미 취소된 캐피탈콜입니다", "BR-CALL-04");
    if (c.paid_amount > 0) throw new AppError(409, "CALL_HAS_PAYMENTS", "이미 송금한 납입이 있어 취소할 수 없습니다. 송금 기록을 먼저 정정하세요", "BR-CALL-04");
    const open = await tx<{ id: string }[]>`
      update payments set status = 'cancelled' where capital_call_id = ${callId} and status in ('requested', 'approved') returning id
    `;
    if (open.length) {
      await tx`
        update approvals set status = 'rejected', decided_at = now(), decision_comment = '캐피탈콜 취소로 자동 반려'
        where target_type = 'payment' and target_id = any(${open.map((p) => p.id)}) and status = 'pending'
      `;
    }
    await tx`update capital_calls set cancelled_at = now() where id = ${callId}`;
  });
  return getCapitalCall(orgId, callId);
}

// ─── 연동 캐피탈콜 반영 (동기화에서 부른다, BR-CALL-01) ─────────────────────

// 🔗 GP GET …/funds/{f}/capital-calls 응답 한 줄
export type GpCapitalCall = {
  call_no: number;
  is_initial: boolean;
  call_date: string;
  due_date: string;
  purpose: string | null;
  status: string;
  my_call_amount: number;
  my_paid_amount: number;
  my_payment_status: string | null;
};

// 회차로 만들기·갱신. 내 요청액이 0인 회차(우리에게 요청이 없음)는 건너뛴다. 결과: 새로 만든 수 · 갱신한 수
export async function upsertGpCalls(orgId: string, commitmentId: string, calls: GpCapitalCall[]) {
  let created = 0;
  let updated = 0;
  for (const g of calls) {
    const amount = Number(g.my_call_amount);
    if (!(amount > 0)) continue;
    const values = {
      is_initial: g.is_initial,
      call_date: g.call_date,
      due_date: g.due_date,
      call_amount: amount,
      purpose: g.purpose,
      gp_payment_status: g.my_payment_status,
      gp_paid_amount: Number(g.my_paid_amount),
    };
    const [row] = await sql<{ inserted: boolean }[]>`
      insert into capital_calls ${sql({ ...values, org_id: orgId, commitment_id: commitmentId, call_no: g.call_no, data_source: "gp_api" })}
      on conflict (commitment_id, call_no) do update set ${sql(values)}
      returning (xmax = 0) as inserted
    `;
    if (row.inserted) created++;
    else updated++;
  }
  return { created, updated };
}
