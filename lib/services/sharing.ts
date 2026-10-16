import { z } from "zod";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { gpClient, type GpActor } from "@/lib/gp/client";
export const sharingKind = z.enum(["reports", "obligations", "attachments"]);
export const sharingRequest = z.object({
  resource_type: sharingKind,
  reason: z.string().trim().min(1).max(2000),
});
export const sharingSnapshot = z.object({
  resources: z.array(
    z.object({
      resource_type: sharingKind,
      allowed: z.boolean(),
      policy_id: z.uuid().nullable(),
      changed_at: z.string().nullable(),
    }),
  ),
  requests: z.array(
    z.object({
      id: z.uuid(),
      resource_type: sharingKind,
      reason: z.string(),
      requested_at: z.string(),
      approved: z.boolean().nullable(),
      decision_reason: z.string().nullable(),
      decided_at: z.string().nullable(),
    }),
  ),
});
export type SharingSnapshot = z.infer<typeof sharingSnapshot>;
async function target(orgId: string, fundId: string) {
  assertUuid(fundId, "조합을");
  const [f] = await sql<
    { gp_id: string; gp_fund_id: string | null; data_source: string }[]
  >`select gp_id,gp_fund_id,data_source from funds where org_id=${orgId} and id=${fundId}`;
  if (!f) throw notFound("조합을");
  if (f.data_source !== "gp_api" || !f.gp_fund_id)
    throw new AppError(
      409,
      "NOT_LINKED",
      "수기 조합은 GP 공유 정책 대상이 아닙니다",
    );
  return f;
}
export async function fetchFundSharing(
  orgId: string,
  fundId: string,
  actor?: GpActor,
) {
  const f = await target(orgId, fundId),
    gp = await gpClient(orgId, f.gp_id, actor);
  const parsed = sharingSnapshot.safeParse(
    await gp.get(`/funds/${f.gp_fund_id}/sharing`),
  );
  if (
    !parsed.success ||
    parsed.data.resources.length !== 3 ||
    new Set(parsed.data.resources.map((r) => r.resource_type)).size !== 3
  )
    throw new AppError(
      503,
      "GP_UNAVAILABLE",
      "공유 정책 응답이 올바르지 않습니다",
    );
  await sql`insert into fund_sharing_states(org_id,fund_id,snapshot) values(${orgId},${fundId},${sql.json(parsed.data)}) on conflict(org_id,fund_id) do update set snapshot=excluded.snapshot,checked_at=clock_timestamp()`;
  return {
    snapshot: parsed.data,
    checked_at: new Date().toISOString(),
    fresh: true as const,
  };
}
export async function storedFundSharing(orgId: string, fundId: string) {
  const [r] = await sql<
    { snapshot: SharingSnapshot; checked_at: Date }[]
  >`select snapshot,checked_at from fund_sharing_states where org_id=${orgId} and fund_id=${fundId}`;
  return r
    ? {
        snapshot: r.snapshot,
        checked_at: r.checked_at.toISOString(),
        fresh: false as const,
      }
    : null;
}
export async function requestFundSharing(
  orgId: string,
  fundId: string,
  input: z.infer<typeof sharingRequest>,
  actor: GpActor,
) {
  const f = await target(orgId, fundId),
    gp = await gpClient(orgId, f.gp_id, actor);
  const result = await gp.post(
    `/funds/${f.gp_fund_id}/sharing/requests`,
    input,
  );
  await fetchFundSharing(orgId, fundId, actor);
  return result;
}
export async function assertReportSharingWritable(
  orgId: string,
  fundId: string,
  dataSource: string,
) {
  if (dataSource !== "gp_api") return;
  const state = await fetchFundSharing(orgId, fundId);
  if (
    !state.snapshot.resources.find((r) => r.resource_type === "reports")
      ?.allowed
  )
    throw new AppError(
      409,
      "SHARING_REVOKED",
      "공유 철회 전 수신 보고는 읽기 전용 보존본입니다",
    );
}
