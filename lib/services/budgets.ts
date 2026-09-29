import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { formatKRW } from "@/lib/format";
import { STRATEGIES, type Strategy } from "@/lib/labels";
import type { AllocationsInput, BudgetCreateInput, BudgetUpdateInput } from "@/lib/schemas/budgets";

// 출자 예산 (R2-1, BR-BUD-01~06). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// 사용액은 저장하지 않고 v_budget_usage 뷰로 계산한다 (선정 승인 + 선정 결재 대기, BR-BUD-03)

export type BudgetSummary = {
  id: string;
  budget_year: number;
  total_amount: number;
  allocated_amount: number;
  used_amount: number;
  remaining_amount: number;
  memo: string | null;
};

export type BudgetStrategyRow = { strategy: Strategy; allocated_amount: number; used_amount: number };
export type BudgetDetail = BudgetSummary & { strategies: BudgetStrategyRow[] };

export async function listBudgets(orgId: string) {
  return sql<BudgetSummary[]>`
    select b.id, b.budget_year, b.total_amount, b.memo,
           coalesce(sum(u.allocated_amount), 0)::bigint as allocated_amount,
           coalesce(sum(u.used_amount), 0)::bigint as used_amount,
           (b.total_amount - coalesce(sum(u.used_amount), 0))::bigint as remaining_amount
    from budgets b
    left join v_budget_usage u on u.budget_id = b.id
    where b.org_id = ${orgId}
    group by b.id
    order by b.budget_year desc
  `;
}

export async function getBudget(orgId: string, budgetId: string): Promise<BudgetDetail> {
  assertUuid(budgetId, "예산을");
  const [budget] = (await listBudgets(orgId)).filter((b) => b.id === budgetId);
  if (!budget) throw notFound("예산을");
  const rows = await sql<BudgetStrategyRow[]>`
    select strategy, allocated_amount, used_amount from v_budget_usage where budget_id = ${budgetId} and org_id = ${orgId}
  `;
  const strategies = STRATEGIES.map((s) => rows.find((r) => r.strategy === s) ?? { strategy: s, allocated_amount: 0, used_amount: 0 });
  return { ...budget, strategies };
}

export async function createBudget(orgId: string, userId: string, input: BudgetCreateInput) {
  const [dup] = await sql<{ id: string }[]>`select id from budgets where org_id = ${orgId} and budget_year = ${input.budget_year}`;
  if (dup) throw new AppError(409, "DUPLICATE_BUDGET", `${input.budget_year}년 예산이 이미 있습니다`, "BR-BUD-01", { existing_budget_id: dup.id });
  const [b] = await sql<{ id: string }[]>`
    insert into budgets (org_id, budget_year, total_amount, memo, created_by)
    values (${orgId}, ${input.budget_year}, ${input.total_amount}, ${input.memo}, ${userId})
    returning id
  `;
  return getBudget(orgId, b.id);
}

// BR-BUD-06: 사용액보다 작게 줄일 수 없다. BR-BUD-02: 분야별 배분 합계보다도 작게 줄일 수 없다
// 예산 행을 잠가서, 같은 순간에 선정 결재가 예산을 쓰는 것과 겹치지 않게 한다 (BR-COM-02)
export async function updateBudget(orgId: string, budgetId: string, input: BudgetUpdateInput) {
  assertUuid(budgetId, "예산을");
  await sql.begin(async (tx) => {
    const [locked] = await tx`select id from budgets where id = ${budgetId} and org_id = ${orgId} for update`;
    if (!locked) throw notFound("예산을");
    const [u] = await tx<{ used: number; allocated: number }[]>`
      select coalesce(sum(used_amount), 0)::bigint as used, coalesce(sum(allocated_amount), 0)::bigint as allocated
      from v_budget_usage where budget_id = ${budgetId}
    `;
    if (input.total_amount < u.used) {
      throw new AppError(422, "BUDGET_BELOW_USAGE", `이미 사용한 금액(${formatKRW(u.used)})보다 작게 줄일 수 없습니다`, "BR-BUD-06", {
        fields: { total_amount: `사용액 ${formatKRW(u.used)} 이상이어야 합니다` },
      });
    }
    if (input.total_amount < u.allocated) {
      throw new AppError(422, "ALLOCATION_EXCEEDS_BUDGET", `분야별 배분 합계(${formatKRW(u.allocated)})보다 작게 줄일 수 없습니다. 배분을 먼저 줄이세요`, "BR-BUD-02", {
        fields: { total_amount: `배분 합계 ${formatKRW(u.allocated)} 이상이어야 합니다` },
      });
    }
    await tx`update budgets set total_amount = ${input.total_amount}, memo = ${input.memo} where id = ${budgetId}`;
  });
  return getBudget(orgId, budgetId);
}

// BR-BUD-02: 분야별 배분 합계 ≤ 예산 총액. 통째로 바꾼다 (0원 분야는 지운다)
// 배분을 넘는 선정은 막지 않고 경고만 한다 (BR-BUD-05) → 이미 쓴 분야의 배분을 사용액 아래로 줄여도 된다
export async function putAllocations(orgId: string, budgetId: string, input: AllocationsInput) {
  assertUuid(budgetId, "예산을");
  await sql.begin(async (tx) => {
    const [b] = await tx<{ total_amount: number }[]>`select total_amount from budgets where id = ${budgetId} and org_id = ${orgId} for update`;
    if (!b) throw notFound("예산을");
    const sum = input.allocations.reduce((s, a) => s + a.amount, 0);
    if (sum > b.total_amount) {
      throw new AppError(422, "ALLOCATION_EXCEEDS_BUDGET", `분야별 배분 합계(${formatKRW(sum)})가 예산 총액(${formatKRW(b.total_amount)})을 넘습니다`, "BR-BUD-02", {
        allocated_amount: sum,
        total_amount: b.total_amount,
      });
    }
    await tx`delete from budget_allocations where budget_id = ${budgetId} and org_id = ${orgId}`;
    for (const a of input.allocations.filter((x) => x.amount > 0)) {
      await tx`insert into budget_allocations (org_id, budget_id, strategy, amount) values (${orgId}, ${budgetId}, ${a.strategy}, ${a.amount})`;
    }
  });
  return getBudget(orgId, budgetId);
}
