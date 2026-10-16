import { sql } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import { gpClient } from "@/lib/gp/client";
import { getCommitment } from "@/lib/services/commitments";
import { performanceDate, AS_OF_ERROR } from "@/lib/performance-date";
import { obligationSnapshotSchema } from "@/lib/schemas/obligations";

// 기관과 GP 출자자 매핑은 서버가 찾는다. 클라이언트가 GP lp_id를 지정하지 않는다.
// GP 판정은 읽기만 한다. LP 자체 원장이나 GP 사본을 덮어쓰지 않는다.
export async function getInvestmentObligations(
  orgId: string,
  commitmentId: string,
  rawDate: string | null,
) {
  const c = await getCommitment(orgId, commitmentId);
  const asOf = performanceDate(rawDate);
  if (!asOf) throw new AppError(400, "VALIDATION_ERROR", AS_OF_ERROR);
  if (c.data_source !== "gp_api")
    throw new AppError(
      409,
      "NOT_LINKED",
      "수기 조합은 GP 의무 조회 대상이 아닙니다",
    );
  const [fund] = await sql<
    { gp_fund_id: string | null }[]
  >`select gp_fund_id from funds where org_id=${orgId} and id=${c.fund_id}`;
  if (!fund?.gp_fund_id)
    throw new AppError(409, "NOT_LINKED", "GP 조합 연결 정보가 없습니다");
  const gp = await gpClient(orgId, c.gp_id);
  const raw = await gp.get<unknown>(
    `/funds/${fund.gp_fund_id}/obligations?as_of=${asOf}`,
  );
  const parsed = obligationSnapshotSchema.safeParse(raw);
  if (!parsed.success || parsed.data.as_of !== asOf)
    throw new AppError(
      503,
      "GP_UNAVAILABLE",
      "GP 의무 응답의 기준일 또는 형식이 올바르지 않습니다",
    );
  return {
    snapshot: parsed.data,
    received_at: new Date().toISOString(),
    source: "gp_live" as const,
  };
}
