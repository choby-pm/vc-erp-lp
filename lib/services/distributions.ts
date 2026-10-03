import type postgres from "postgres";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import type { DataSource } from "@/lib/labels";
import { getCommitment } from "@/lib/services/commitments";
import { reconcile } from "@/lib/services/reconciliation";
import type { DistributionCreateInput, DistributionReceiveInput } from "@/lib/schemas/distributions";

// 분배 (R6-1, BR-DIST-01~05, L39·L41). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
//   announced(수령 대기) → received(수령) / cancelled
// · 연동: GP가 확정한 분배가 들어온다. 금액·단계별 구성은 GP 값 (BR-DIST-01). 원금 반환 = 원금 반환 단계, 수익 = 나머지 (L41)
// · 수령은 담당자가 통장 입금을 보고 기록한다 — 연동도 같다 (L39). 한 트랜잭션: 수령 + 우리 장부 '분배' 행 + (연동) 분배 대사
// · 가져온 출자 건의 연결 전 분배(GP 지급 완료)는 자동으로 "가져온 수령" (L27·L32)
// · 입력 실수 정정: 원래 날짜로 취소 행 → 수령 대기로 되돌림 (BR-DIST-05). GP가 지급 뒤 취소: 오늘 날짜 취소 행 → 취소 (BR-DIST-04)

type Db = typeof sql;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export type DistributionItem = {
  id: string;
  commitment_id: string;
  fund_id: string;
  fund_name: string;
  gp_name: string;
  distribution_no: number;
  is_final: boolean;
  distribution_date: string;
  amount: number;
  return_of_capital_amount: number | null;
  profit_amount: number | null;
  gp_components: Record<string, number> | null;
  status: "announced" | "received" | "cancelled";
  received_date: string | null;
  received_via: "recorded" | "imported" | null;
  gp_status: "confirmed" | "paid" | "cancelled" | null;
  data_source: DataSource;
};

const listQuery = (db: Db, orgId: string) => db`
  select d.id, d.commitment_id, m.fund_id, f.name as fund_name, g.name as gp_name, d.distribution_no, d.is_final, d.distribution_date,
         d.amount, d.return_of_capital_amount, d.profit_amount, d.gp_components, d.status, d.received_date, d.received_via, d.gp_status, d.data_source
  from distributions d join commitments m on m.id = d.commitment_id join funds f on f.id = m.fund_id join gps g on g.id = f.gp_id
  where d.org_id = ${orgId}
`;

export async function listDistributions(orgId: string, q: { status?: "announced" | "received" | "all"; commitment_id?: string } = {}) {
  const status = q.status ?? "announced";
  return sql<DistributionItem[]>`
    select * from (${listQuery(sql, orgId)}) x
    where ${status === "all" ? sql`true` : sql`x.status = ${status}`} ${q.commitment_id ? sql`and x.commitment_id = ${q.commitment_id}` : sql``}
    order by x.distribution_date desc, x.distribution_no desc
  `;
}

export async function getDistribution(orgId: string, id: string, db: Db = sql) {
  assertUuid(id, "분배를");
  const [d] = await db<DistributionItem[]>`select * from (${listQuery(db, orgId)}) x where x.id = ${id}`;
  if (!d) throw notFound("분배를");
  return d;
}

async function lockDistribution(tx: postgres.TransactionSql, orgId: string, id: string) {
  const d = await getDistribution(orgId, id, tx as unknown as Db);
  await tx`select id from commitments where id = ${d.commitment_id} for update`;
  await tx`select id from distributions where id = ${id} for update`;
  const [m] = await tx<{ status: string }[]>`select status from commitments where id = ${d.commitment_id}`;
  if (m.status === "closed") throw new AppError(409, "COMMITMENT_CLOSED", "청산 확인된 출자 건이라 바꿀 수 없습니다", "BR-CLOSE-02");
  return getDistribution(orgId, id, tx as unknown as Db);
}

// 우리 장부 '분배' 행 넣기 · 취소 행 넣기
async function addLedger(tx: postgres.TransactionSql, orgId: string, d: DistributionItem, date: string, memo: string, userId: string | null) {
  await tx`
    insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo, created_by)
    values (${orgId}, ${d.commitment_id}, 'distribution', ${d.amount}, ${date}, 'distribution', ${d.id}, ${memo}, ${userId})
  `;
}
async function reverseLedger(tx: postgres.TransactionSql, orgId: string, d: DistributionItem, date: "original" | "today", memo: string, userId: string | null) {
  const [e] = await tx<{ id: string; entry_date: string }[]>`
    select id, entry_date::text from ledger_entries
    where source_type = 'distribution' and source_id = ${d.id} and reversal_of_id is null
      and not exists (select 1 from ledger_entries r where r.reversal_of_id = ledger_entries.id)
  `;
  if (!e) return;
  await tx`
    insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, reversal_of_id, memo, created_by)
    values (${orgId}, ${d.commitment_id}, 'distribution', ${-d.amount}, ${date === "original" ? e.entry_date : today()}, 'distribution', ${d.id}, ${e.id}, ${memo}, ${userId})
  `;
}

// ─── 수령 기록 · 정정 (BR-DIST-03·05, L39) ───────────────────────────────────

export async function receiveDistribution(orgId: string, userId: string, id: string, input: DistributionReceiveInput) {
  await sql.begin(async (tx) => {
    const d = await lockDistribution(tx, orgId, id);
    if (d.status !== "announced") throw new AppError(409, "INVALID_STATE", d.status === "received" ? "이미 수령 기록한 분배입니다" : "취소된 분배입니다", "BR-DIST-03");
    if (input.received_date < d.distribution_date || input.received_date > today()) {
      const message = `수령일은 분배일(${d.distribution_date}) 이후이고 오늘 이전이어야 합니다`;
      throw new AppError(422, "INVALID_DATE", message, "BR-DIST-03", { fields: { received_date: message } });
    }
    await tx`update distributions set status = 'received', received_date = ${input.received_date}, received_via = 'recorded' where id = ${id}`;
    await addLedger(tx, orgId, d, input.received_date, `${d.distribution_no}회 분배 수령`, userId);
    if (d.data_source === "gp_api") await reconcile(tx as unknown as Db, orgId, d.commitment_id, "distribution");
  });
  return getDistribution(orgId, id);
}

// 수령 기록 정정: 입력 실수를 바로잡는 것이라 원래 날짜로 취소 행, 수령 대기로 되돌린다. 가져온 수령은 GP 원장이 근거라 못 고친다
export async function correctReceipt(orgId: string, userId: string, id: string, reason: string) {
  await sql.begin(async (tx) => {
    const d = await lockDistribution(tx, orgId, id);
    if (d.status !== "received") throw new AppError(409, "INVALID_STATE", "수령 기록한 분배만 정정할 수 있습니다", "BR-DIST-05");
    if (d.received_via === "imported") throw new AppError(409, "GP_MANAGED_FIELD", "가져온 수령은 GP 원장이 근거라 고칠 수 없습니다", "BR-COM-05");
    await reverseLedger(tx, orgId, d, "original", `수령 기록 정정: ${reason}`, userId);
    await tx`update distributions set status = 'announced', received_date = null, received_via = null where id = ${id}`;
    if (d.data_source === "gp_api") await reconcile(tx as unknown as Db, orgId, d.commitment_id, "distribution");
  });
  return getDistribution(orgId, id);
}

// ─── 수기 분배 (BR-DIST-02) ──────────────────────────────────────────────────

export async function createManualDistribution(orgId: string, userId: string, commitmentId: string, input: DistributionCreateInput) {
  const id = await sql.begin(async (tx) => {
    await tx`select id from commitments where id = ${commitmentId} and org_id = ${orgId} for update`;
    const c = await getCommitment(orgId, commitmentId, tx as unknown as Db);
    if (c.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 조합의 분배는 GP에서 자동으로 들어옵니다", "BR-DIST-01");
    if (c.status !== "active") throw new AppError(409, "COMMITMENT_NOT_ACTIVE", "활성 출자 건에만 분배를 기록합니다", "BR-CMT-07");
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(distribution_no), 0) + 1 as next from distributions where commitment_id = ${commitmentId}`;
    const no = input.distribution_no ?? next;
    const [dup] = await tx`select 1 from distributions where commitment_id = ${commitmentId} and distribution_no = ${no}`;
    if (dup) throw new AppError(409, "DUPLICATE_DISTRIBUTION_NO", `${no}회 분배가 이미 있습니다`, "BR-DIST-02", { fields: { distribution_no: `다음 회차는 ${next}회입니다` } });
    const [d] = await tx<{ id: string }[]>`
      insert into distributions (org_id, commitment_id, distribution_no, is_final, distribution_date, amount, return_of_capital_amount, profit_amount, status, data_source, created_by)
      values (${orgId}, ${commitmentId}, ${no}, ${input.is_final}, ${input.distribution_date}, ${input.return_of_capital_amount + input.profit_amount},
              ${input.return_of_capital_amount}, ${input.profit_amount}, 'announced', 'manual', ${userId})
      returning id
    `;
    return d.id;
  });
  return getDistribution(orgId, id);
}

// ─── 연동 분배 받기 (동기화에서 부른다, BR-DIST-01·04, L39·L41) ──────────────

export type GpDistribution = {
  distribution_no: number;
  is_final: boolean;
  distribution_date: string;
  status: "confirmed" | "paid";
  distributable_amount: number;
  my_components: Record<string, number>;
  my_amount: number;
};

// 회차로 만들기·갱신. 내 몫이 0인 회차는 건너뛴다. GP 목록에서 사라진(취소된) 회차는 취소 처리 (BR-DIST-04)
// 가져온 출자 건이면 연결 전 지급 완료 분배를 "가져온 수령"으로 (L27·L32). 수령일 = GP 원장 사본의 그 회차 분배 날짜
export async function upsertGpDistributions(orgId: string, commitmentId: string, list: GpDistribution[]) {
  const result = { created: 0, updated: 0, cancelled: 0, imported: 0 };
  await sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    await tx`select id from commitments where id = ${commitmentId} for update`;
    const [m] = await tx<{ origin: string; since: string }[]>`
      select origin, (created_at at time zone 'Asia/Seoul')::date::text as since from commitments where id = ${commitmentId}
    `;
    for (const g of list) {
      const amount = Number(g.my_amount);
      if (!(amount > 0)) continue;
      const comps = Object.fromEntries(Object.entries(g.my_components ?? {}).map(([k, v]) => [k, Number(v)]));
      const roc = comps.return_of_capital ?? 0;
      const values = {
        is_final: g.is_final,
        distribution_date: g.distribution_date,
        amount,
        return_of_capital_amount: roc,
        profit_amount: amount - roc,
        gp_components: tx.json(comps as never),
        gp_status: g.status,
      };
      const [row] = await tx<{ id: string; inserted: boolean }[]>`
        insert into distributions ${tx({ ...values, org_id: orgId, commitment_id: commitmentId, distribution_no: g.distribution_no, status: "announced", data_source: "gp_api" } as never)}
        on conflict (commitment_id, distribution_no) do update set ${tx(values as never)}
        returning id, (xmax = 0) as inserted
      `;
      if (row.inserted) result.created++;
      else result.updated++;
      // 가져온 수령: 연결 전에 GP가 지급한 분배
      if (m.origin === "imported" && g.status === "paid" && g.distribution_date < m.since) {
        const [d] = await tx<{ status: string }[]>`select status from distributions where id = ${row.id}`;
        if (d.status === "announced") {
          const [e] = await tx<{ entry_date: string }[]>`
            select min(entry_date)::text as entry_date from gp_ledger_entries
            where commitment_id = ${commitmentId} and entry_type = 'distribution' and (gp_source->>'distribution_no')::int = ${g.distribution_no} and gp_reversal_of_id is null
          `;
          const date = e?.entry_date ?? g.distribution_date;
          await tx`update distributions set status = 'received', received_date = ${date}, received_via = 'imported' where id = ${row.id}`;
          const item = await getDistribution(orgId, row.id, t);
          await addLedger(tx, orgId, item, date, `${g.distribution_no}회 분배 가져온 수령 (GP 원장 근거)`, null);
          result.imported++;
        }
      }
    }
    // GP 목록에서 사라진 회차 = GP가 취소 (BR-DIST-04)
    const gone = await tx<{ id: string }[]>`
      select id from distributions
      where commitment_id = ${commitmentId} and data_source = 'gp_api' and status <> 'cancelled'
        and not (distribution_no = any(${list.filter((g) => Number(g.my_amount) > 0).map((g) => g.distribution_no)}::int[]))
    `;
    for (const r of gone) {
      const d = await getDistribution(orgId, r.id, t);
      if (d.status === "received") await reverseLedger(tx, orgId, d, "today", "GP가 분배를 취소함 (돈을 돌려주는 절차는 시스템 밖)", null);
      await tx`update distributions set status = 'cancelled', gp_status = 'cancelled' where id = ${r.id}`;
      result.cancelled++;
    }
    if (result.imported + result.cancelled > 0) await reconcile(t, orgId, commitmentId, "distribution");
  });
  return result;
}
