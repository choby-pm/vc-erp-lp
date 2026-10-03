import type { sql as Sql } from "@/lib/db";

// 대사 (04 비즈니스 규칙 9장, L6)
// · 우리 장부(ledger_entries)와 GP 원장 사본(gp_ledger_entries)의 구분별 합계를 비교한다 (BR-REC-01, 03)
// · 숫자가 직전 대사 행과 같으면 새 행을 만들지 않는다 (BR-REC-02). 덮어쓰지 않고 추가만 해서 "언제부터 어긋났는지"가 남는다
// · 바뀐 쪽의 트랜잭션 안에서 부른다 (우리 장부가 바뀌면 그 트랜잭션, GP 사본이 바뀌면 동기화 트랜잭션)

export type EntryType = "commitment" | "contribution" | "distribution";

export async function reconcile(tx: typeof Sql, orgId: string, commitmentId: string, entryType: EntryType) {
  const [{ our_amount, gp_amount }] = await tx<{ our_amount: number; gp_amount: number }[]>`
    select
      (select coalesce(sum(amount), 0) from ledger_entries where org_id = ${orgId} and commitment_id = ${commitmentId} and entry_type = ${entryType})::bigint as our_amount,
      (select coalesce(sum(amount), 0) from gp_ledger_entries where org_id = ${orgId} and commitment_id = ${commitmentId} and entry_type = ${entryType})::bigint as gp_amount
  `;
  const [last] = await tx<{ our_amount: number; gp_amount: number }[]>`
    select our_amount, gp_amount from v_recon_current where org_id = ${orgId} and commitment_id = ${commitmentId} and entry_type = ${entryType}
  `;
  if (last && last.our_amount === our_amount && last.gp_amount === gp_amount) return null;
  const status = our_amount === gp_amount ? "matched" : "mismatched";
  await tx`
    insert into reconciliations (org_id, commitment_id, entry_type, our_amount, gp_amount, recon_status)
    values (${orgId}, ${commitmentId}, ${entryType}, ${our_amount}, ${gp_amount}, ${status})
  `;
  return { entry_type: entryType, our_amount, gp_amount, recon_status: status };
}

// 지금 이어지고 있는 불일치가 처음 생긴 시각 (BR-REC-04 "불일치가 생긴 지 7일"). 불일치 중에 숫자가 또 바뀌어도 처음 시각을 쓴다
// 일치·확인 완료 뒤에 다시 생긴 불일치는 그때부터 센다. 지금 불일치가 아니면 null
export async function mismatchSince(db: typeof Sql, commitmentId: string, entryType: EntryType): Promise<Date | null> {
  const [r] = await db<{ since: Date | null }[]>`
    select min(checked_at) as since from reconciliations
    where commitment_id = ${commitmentId} and entry_type = ${entryType} and recon_status = 'mismatched'
      and checked_at > coalesce((select max(checked_at) from reconciliations
                                 where commitment_id = ${commitmentId} and entry_type = ${entryType} and recon_status <> 'mismatched'), '-infinity')
  `;
  return r?.since ?? null;
}
