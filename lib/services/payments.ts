import type postgres from "postgres";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { formatKRW } from "@/lib/format";
import { getCapitalCall } from "@/lib/services/capital-calls";
import { mismatchSince, reconcile } from "@/lib/services/reconciliation";
import type { PaymentCancelInput, PaymentCreateInput, PaymentMarkPaidInput } from "@/lib/schemas/payments";

// 납입 (R4-2, L4·L9, BR-PAY-01~06). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
//   requested(결재 대기) → approved(송금 대기) → paid(송금 완료)
//   requested → rejected (결재권자 반려)        approved → cancelled (송금 전 취소)
//   paid → cancelled (송금 기록 정정: 장부에 원래 날짜로 취소 행, BR-PAY-05)
// · 결재 대기 중인 납입은 취소하지 않는다. 결재권자가 반려한다 (BR-APR-03·08, L31)
// · 결재와 송금을 나눈다. 승인됐다고 돈이 나간 게 아니다. 송금 완료가 되는 순간 장부 '납입' 행 + 대사 (BR-PAY-04)
// · 한 캐피탈콜에 여러 납입(분할 납입, L9). 송금 완료 + 결재 대기 + 송금 대기 합계 ≤ 요청액 (BR-PAY-02)

type Db = typeof sql;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export type PaymentStatus = "requested" | "approved" | "paid" | "rejected" | "cancelled";
export type PaymentItem = {
  id: string;
  capital_call_id: string;
  amount: number;
  planned_date: string | null;
  status: PaymentStatus;
  paid_date: string | null;
  bank_reference: string | null;
  origin: "approval" | "imported";
  created_by_name: string | null;
  created_at: Date;
  approval_id: string | null; // 가장 최근 결재
  approval_status: string | null;
  correction_memo: string | null; // 송금 기록 정정 사유 (장부 취소 행의 메모)
};

const paymentQuery = (db: Db, orgId: string) => db`
  select p.id, p.capital_call_id, p.amount, p.planned_date, p.status, p.paid_date, p.bank_reference, p.origin,
         u.name as created_by_name, p.created_at, a.id as approval_id, a.status as approval_status,
         (select r.memo from ledger_entries r join ledger_entries e on e.id = r.reversal_of_id
          where e.source_type = 'payment' and e.source_id = p.id limit 1) as correction_memo
  from payments p
  left join users u on u.id = p.created_by
  left join lateral (select id, status from approvals where target_type = 'payment' and target_id = p.id order by requested_at desc limit 1) a on true
  where p.org_id = ${orgId}
`;

export async function listPayments(orgId: string, callId: string) {
  return sql<PaymentItem[]>`${paymentQuery(sql, orgId)} and p.capital_call_id = ${callId} order by p.created_at`;
}

export async function getPayment(orgId: string, paymentId: string, db: Db = sql) {
  assertUuid(paymentId, "납입을");
  const [p] = await db<PaymentItem[]>`${paymentQuery(db, orgId)} and p.id = ${paymentId}`;
  if (!p) throw notFound("납입을");
  return p;
}

// 캐피탈콜과 출자 건을 잠그고 가져온다 (BR-PAY-06, BR-COM-02: 한도 검사 동시성)
async function lockCall(tx: postgres.TransactionSql, orgId: string, callId: string) {
  const t = tx as unknown as Db;
  const c = await getCapitalCall(orgId, callId, t);
  await tx`select id from commitments where id = ${c.commitment_id} for update`;
  await tx`select id from capital_calls where id = ${callId} for update`;
  const [m] = await tx<{ status: string; data_source: string }[]>`
    select m.status, f.data_source from commitments m join funds f on f.id = m.fund_id where m.id = ${c.commitment_id}
  `;
  // 청산 확인된 출자 건은 장부를 더 바꾸지 않는다 (BR-CLOSE-02)
  if (m.status === "closed") throw new AppError(409, "COMMITMENT_CLOSED", "청산 확인된 출자 건이라 납입을 바꿀 수 없습니다", "BR-CLOSE-02");
  return { call: await getCapitalCall(orgId, callId, t), commitmentStatus: m.status, dataSource: m.data_source };
}

// ─── 납입 기안 (BR-PAY-02, BR-APR-01·04) ─────────────────────────────────────

export async function requestPayment(orgId: string, userId: string, callId: string, input: PaymentCreateInput) {
  const result = await sql.begin(async (tx) => {
    const { call, commitmentStatus } = await lockCall(tx, orgId, callId);
    if (call.cancelled_at) throw new AppError(409, "INVALID_STATE", "취소된 캐피탈콜입니다", "BR-CALL-04");
    if (commitmentStatus !== "active") throw new AppError(409, "COMMITMENT_NOT_ACTIVE", "결성 확인된(활성) 출자 건만 납입할 수 있습니다", "BR-CMT-07");
    const left = call.call_amount - call.paid_amount - call.pending_amount;
    if (input.amount > left) {
      const message = `요청액 ${formatKRW(call.call_amount)} 중 송금 완료 ${formatKRW(call.paid_amount)} · 진행 중 ${formatKRW(call.pending_amount)}이라 ${formatKRW(Math.max(left, 0))}까지 기안할 수 있습니다`;
      throw new AppError(422, "PAYMENT_EXCEEDS_CALL", message, "BR-PAY-02", { fields: { amount: message } });
    }
    if (input.planned_date && input.planned_date < call.call_date) {
      throw new AppError(422, "INVALID_DATE", "송금 예정일은 요청일 이후여야 합니다", "BR-PAY-02", { fields: { planned_date: "요청일 이후 날짜를 입력하세요" } });
    }
    const [p] = await tx<{ id: string }[]>`
      insert into payments (org_id, capital_call_id, amount, planned_date, status, origin, created_by)
      values (${orgId}, ${callId}, ${input.amount}, ${input.planned_date}, 'requested', 'approval', ${userId})
      returning id
    `;
    // 결재 화면은 기안 시점 스냅샷을 보여준다 (BR-APR-04)
    const snapshot = {
      payment: { amount: input.amount, planned_date: input.planned_date },
      capital_call: {
        fund_name: call.fund_name,
        gp_name: call.gp_name,
        call_no: call.call_no,
        call_date: call.call_date,
        due_date: call.due_date,
        call_amount: call.call_amount,
        purpose: call.purpose,
        data_source: call.data_source,
        paid_amount: call.paid_amount,
        pending_amount: call.pending_amount,
      },
    };
    const [a] = await tx<{ id: string }[]>`
      insert into approvals (org_id, target_type, target_id, requested_by, request_comment, snapshot)
      values (${orgId}, 'payment', ${p.id}, ${userId}, ${input.request_comment}, ${tx.json(snapshot as never)})
      returning id
    `;
    return { payment_id: p.id, approval_id: a.id };
  });
  return { payment: await getPayment(orgId, result.payment_id), approval_id: result.approval_id };
}

// 결재 승인·반려 때 (approvals 서비스의 트랜잭션 안에서)
export async function applyPaymentDecision(tx: postgres.TransactionSql, paymentId: string, decision: "approved" | "rejected") {
  const [row] = await tx`update payments set status = ${decision} where id = ${paymentId} and status = 'requested' returning id`;
  if (!row) throw new AppError(409, "CONFLICT", "결재 대기 중인 납입이 아닙니다", "BR-PAY-01");
  return { payment_id: paymentId, payment_status: decision };
}

// ─── 송금 완료 (BR-PAY-03·04) ────────────────────────────────────────────────

// 승인된 납입만. 송금일은 요청일 이후 · 오늘 이전. 한 트랜잭션: 송금 완료 + 장부 '납입' 행 + (연동) 납입 대사
export async function markPaid(orgId: string, userId: string, paymentId: string, input: PaymentMarkPaidInput) {
  const out = await sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    const p0 = await getPayment(orgId, paymentId, t);
    const { call, dataSource } = await lockCall(tx, orgId, p0.capital_call_id);
    const [p] = await tx<{ status: PaymentStatus; amount: number }[]>`select status, amount from payments where id = ${paymentId} for update`;
    if (p.status === "requested") throw new AppError(409, "APPROVAL_REQUIRED", "결재가 승인되지 않은 납입은 송금 기록을 할 수 없습니다", "BR-PAY-03");
    if (p.status !== "approved") throw new AppError(409, "INVALID_STATE", "송금 대기 중인 납입만 송금 기록을 할 수 있습니다", "BR-PAY-01");
    if (input.paid_date < call.call_date || input.paid_date > today()) {
      const message = `송금일은 요청일(${call.call_date}) 이후이고 오늘 이전이어야 합니다`;
      throw new AppError(422, "INVALID_DATE", message, "BR-PAY-04", { fields: { paid_date: message } });
    }
    await tx`update payments set status = 'paid', paid_date = ${input.paid_date}, bank_reference = ${input.bank_reference} where id = ${paymentId}`;
    await tx`
      insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo, created_by)
      values (${orgId}, ${call.commitment_id}, 'contribution', ${p.amount}, ${input.paid_date}, 'payment', ${paymentId},
              ${`${call.call_no}회 캐피탈콜 납입`}, ${userId})
    `;
    if (dataSource === "gp_api") await reconcile(t, orgId, call.commitment_id, "contribution");
    return { commitment_id: call.commitment_id, linked: dataSource === "gp_api" };
  });
  return paymentResult(orgId, paymentId, out);
}

// ─── 취소 · 송금 기록 정정 (BR-PAY-05) ──────────────────────────────────────

// 송금 대기(approved) → 취소. 송금 완료(paid) → 정정: 장부에 원래 날짜로 취소 행 (입력 실수를 바로잡는 것이라 원래 날짜) + 대사.
// 결재 대기(requested)는 취소하지 않는다 — 결재권자가 반려 (L31). 가져온 납입은 GP 원장이 근거라 정정하지 않는다
export async function cancelPayment(orgId: string, userId: string, paymentId: string, input: PaymentCancelInput) {
  const out = await sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    const p0 = await getPayment(orgId, paymentId, t);
    const { call, dataSource } = await lockCall(tx, orgId, p0.capital_call_id);
    const [p] = await tx<{ status: PaymentStatus; origin: string; amount: number }[]>`select status, origin, amount from payments where id = ${paymentId} for update`;
    if (p.origin === "imported") throw new AppError(409, "GP_MANAGED_FIELD", "가져온 납입은 GP 원장이 근거라 고칠 수 없습니다", "BR-COM-05");
    if (p.status === "requested") throw new AppError(409, "APPROVAL_PENDING", "결재 대기 중인 납입은 취소할 수 없습니다. 결재권자가 반려하세요", "BR-APR-03");
    if (p.status !== "approved" && p.status !== "paid") throw new AppError(409, "INVALID_STATE", "이미 반려·취소된 납입입니다", "BR-PAY-01");
    if (p.status === "paid") {
      const [entry] = await tx<{ id: string; entry_date: string }[]>`
        select id, entry_date from ledger_entries
        where source_type = 'payment' and source_id = ${paymentId} and reversal_of_id is null
          and not exists (select 1 from ledger_entries r where r.reversal_of_id = ledger_entries.id)
      `;
      if (entry) {
        await tx`
          insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, reversal_of_id, memo, created_by)
          values (${orgId}, ${call.commitment_id}, 'contribution', ${-p.amount}, ${entry.entry_date}, 'payment', ${paymentId}, ${entry.id},
                  ${`송금 기록 정정: ${input.reason}`}, ${userId})
        `;
      }
      if (dataSource === "gp_api") await reconcile(t, orgId, call.commitment_id, "contribution");
    }
    await tx`update payments set status = 'cancelled' where id = ${paymentId}`;
    return { commitment_id: call.commitment_id, linked: dataSource === "gp_api" };
  });
  return paymentResult(orgId, paymentId, out);
}

// 응답: 납입 + 캐피탈콜 + (연동) 지금 납입 대사 — 송금 직후 불일치는 확인 대기 (05 API 설계 4-2, L10)
async function paymentResult(orgId: string, paymentId: string, out: { commitment_id: string; linked: boolean }) {
  const payment = await getPayment(orgId, paymentId);
  const capital_call = await getCapitalCall(orgId, payment.capital_call_id);
  let reconciliation = null;
  if (out.linked) {
    const [r] = await sql<{ our_amount: number; gp_amount: number; recon_status: string; checked_at: Date }[]>`
      select our_amount, gp_amount, recon_status, checked_at from v_recon_current where commitment_id = ${out.commitment_id} and entry_type = 'contribution'
    `;
    if (r) {
      const since = (await mismatchSince(sql, out.commitment_id, "contribution")) ?? r.checked_at; // 불일치가 처음 생긴 때부터 7일 (BR-REC-04)
      const waitingUntil = new Date(new Date(since).getTime() + 7 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
      reconciliation = { entry_type: "contribution", ...r, ...(r.recon_status === "mismatched" ? { waiting_until: waitingUntil } : {}) };
    }
  }
  return { payment, capital_call, reconciliation };
}
