import { sql } from "@/lib/db";
import { reconcile } from "@/lib/services/reconciliation";

// 가져온 출자 건의 과거 납입 옮기기 (R4-3, L27·L32)
// · 이 시스템을 쓰기 전에 이미 출자한 연동 조합(가져온 출자 건, L19)은 GP 원장에 과거 납입이 있는데 우리 장부는 비어 있다
// · GP 원장 사본의 납입 행마다 "가져온 납입"(결재 없음, 송금 완료, 근거 = GP 행)을 만들고 우리 장부 '납입' 행 + 납입 대사
// · 연결 전 납입만 옮긴다: GP 행 날짜 < 가져온 출자 건이 생긴 날(KST). 그 뒤 납입은 우리가 기안·결재·송금하는 보통 흐름이고,
//   GP가 그 입금을 기록하면 원장 사본과 우리 장부가 대사로 맞춰진다 (자동으로 옮기면 같은 돈이 두 번 들어간다)
// · GP에서 취소된 행(취소 행이 붙은 행)과 취소 행 자체는 옮기지 않는다 (합계가 0)
// · 같은 GP 행은 한 번만 (payments.gp_entry_id 유일). 다시 맞추기를 여러 번 해도 결과가 같다
// · 캐피탈콜은 회차로 찾는다 (GP 원장 사본의 원인 정보 call_no). 회차가 우리에게 없으면 건너뛰고 사유를 남긴다
// · 분배는 R6에서 같은 방식

export type ImportResult = { imported: number; amount: number; skipped: { gp_entry_id: string; reason: string }[] };

export async function importPastPayments(orgId: string, commitmentId: string): Promise<ImportResult> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [m] = await tx<{ origin: string; status: string; since: string }[]>`
      select origin, status, (created_at at time zone 'Asia/Seoul')::date::text as since from commitments where id = ${commitmentId} and org_id = ${orgId} for update
    `;
    if (!m || m.origin !== "imported" || m.status !== "active") return { imported: 0, amount: 0, skipped: [] };

    const rows = await tx<{ gp_entry_id: string; amount: number; entry_date: string; call_no: number | null }[]>`
      select g.gp_entry_id, g.amount, g.entry_date, (g.gp_source->>'call_no')::int as call_no
      from gp_ledger_entries g
      where g.org_id = ${orgId} and g.commitment_id = ${commitmentId} and g.entry_type = 'contribution'
        and g.gp_reversal_of_id is null
        and not exists (select 1 from gp_ledger_entries r where r.org_id = g.org_id and r.gp_reversal_of_id = g.gp_entry_id)
        and g.entry_date < ${m.since}
        and not exists (select 1 from payments p where p.org_id = g.org_id and p.gp_entry_id = g.gp_entry_id)
      order by g.entry_date, g.synced_at
    `;
    const result: ImportResult = { imported: 0, amount: 0, skipped: [] };
    for (const r of rows) {
      const [call] = r.call_no
        ? await tx<{ id: string }[]>`select id from capital_calls where commitment_id = ${commitmentId} and call_no = ${r.call_no} and cancelled_at is null`
        : [];
      if (!call) {
        result.skipped.push({ gp_entry_id: r.gp_entry_id, reason: r.call_no ? `우리에게 ${r.call_no}회 캐피탈콜이 없음` : "GP 원인 정보에 회차가 없음" });
        continue;
      }
      const [p] = await tx<{ id: string }[]>`
        insert into payments (org_id, capital_call_id, amount, status, paid_date, origin, gp_entry_id)
        values (${orgId}, ${call.id}, ${r.amount}, 'paid', ${r.entry_date}, 'imported', ${r.gp_entry_id})
        returning id
      `;
      await tx`
        insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo)
        values (${orgId}, ${commitmentId}, 'contribution', ${r.amount}, ${r.entry_date}, 'payment', ${p.id}, ${`${r.call_no}회 캐피탈콜 가져온 납입 (GP 원장 근거)`})
      `;
      result.imported++;
      result.amount += Number(r.amount);
    }
    if (result.imported > 0) await reconcile(t, orgId, commitmentId, "contribution");
    return result;
  });
}
