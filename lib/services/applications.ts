import { z } from "zod";
import { sql } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import { STRATEGY_LABEL, type Strategy } from "@/lib/labels";
import { syncProposals } from "@/lib/gp/sync";

// GP의 공고 지원 받기 (R8-3, L50~L54 · GP D47)
// · GP가 "이 제안을 이 공고 부문에 지원했다"고 알리면(서명한 요청), 받은 순간을 접수 시각으로 보고(L54) 기간 · 공고 상태를 검사한다
// · 요청은 신호로만 쓴다: GP 출자 제안 목록을 다시 읽어 그 제안을 공고 부문에 공고형 제안으로 접수한다 (지금 자동 접수와 같은 길, BR-SYNC)
// · 같은 지원을 다시 보내면 이미 받은 것을 그대로 돌려준다 (GP "다시 보내기"가 안전하다)
// · 거부하면 422 + 이유 → GP 화면에 그대로 보인다

export const applicationSchema = z.object({
  gp_proposal_id: z.uuid(),
  gp_lp_id: z.uuid(),
  program_id: z.uuid(),
  track_id: z.uuid(),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

const todayKst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const reject = (code: string, message: string) => new AppError(422, code, message, "L54");

export async function receiveApplication(connectionId: string, input: ApplicationInput) {
  // 1) 어느 기관 · 어느 GP인가: 이 연결에서 그 GP 출자자가 우리 기관 중 어디인지
  const [link] = await sql<{ org_id: string; gp_id: string; org_name: string }[]>`
    select l.org_id, l.gp_id, o.name as org_name from gp_lp_links l join orgs o on o.id = l.org_id
    where l.gp_connection_id = ${connectionId} and l.gp_lp_id = ${input.gp_lp_id}
  `;
  if (!link) throw reject("LP_NOT_LINKED", "이 GP와 연동되지 않은 기관입니다");

  // 이미 받은 지원이면 그대로 돌려준다
  const [existing] = await sql<{ id: string; created_at: Date; program_track_id: string | null }[]>`
    select id, created_at, program_track_id from proposals where org_id = ${link.org_id} and gp_proposal_id = ${input.gp_proposal_id}
  `;
  if (existing) {
    if (existing.program_track_id !== input.track_id) throw reject("ALREADY_RECEIVED", "이 출자 제안은 이미 다른 경로로 접수돼 있습니다");
    return { org_id: link.org_id, lp_proposal_id: existing.id, received_at: existing.created_at, result: "already_received" as const };
  }

  // 2) 공고 · 부문 검사 — 받은 지금이 접수 기간 안이어야 한다 (L54)
  const [program] = await sql<{ id: string; name: string; status: string; apply_start_date: string; apply_end_date: string }[]>`
    select id, name, status, apply_start_date::text, apply_end_date::text from programs where id = ${input.program_id} and org_id = ${link.org_id}
  `;
  if (!program) throw reject("CALL_NOT_FOUND", `${link.org_name}의 공고를 찾을 수 없습니다`);
  const today = todayKst();
  if (program.status !== "open") throw reject("CALL_CLOSED", `"${program.name}"은(는) 접수가 끝난 공고입니다`);
  if (today < program.apply_start_date || today > program.apply_end_date) {
    throw reject("CALL_CLOSED", `"${program.name}" 접수 기간(${program.apply_start_date} ~ ${program.apply_end_date})이 아닙니다`);
  }
  const [track] = await sql<{ id: string; name: string; strategy: Strategy }[]>`
    select id, name, strategy from program_tracks where id = ${input.track_id} and program_id = ${program.id}
  `;
  if (!track) throw reject("TRACK_NOT_FOUND", "이 공고의 모집 부문이 아닙니다");

  // 3) GP 출자 제안을 다시 읽어 공고 부문에 접수 — 분야도 한 번 더 본다 (GP가 먼저 막지만 원본 규칙은 LP)
  const receivedAt = new Date();
  const results = await syncProposals(link.org_id, link.gp_id, { application: { gpProposalId: input.gp_proposal_id, trackId: track.id, receivedAt } });
  const mine = results.find((r) => r.gp_proposal_id === input.gp_proposal_id);
  if (!mine) throw reject("PROPOSAL_NOT_FOUND", "GP 출자 제안 목록에서 이 지원을 찾지 못했습니다");
  if (mine.result === "skipped") throw reject("NOT_RECEIVED", `접수하지 못했습니다: ${mine.reason ?? "이유 없음"}`);

  const [row] = await sql<{ id: string; created_at: Date; strategy: Strategy }[]>`
    select p.id, p.created_at, f.strategy from proposals p join funds f on f.id = p.fund_id
    where p.org_id = ${link.org_id} and p.gp_proposal_id = ${input.gp_proposal_id}
  `;
  if (row.strategy !== track.strategy) {
    // 받아 둔 제안은 담당자가 보고 판단하게 남기고, GP에는 이유를 알린다
    throw reject("STRATEGY_MISMATCH", `조합 분야(${STRATEGY_LABEL[row.strategy]})와 부문 분야(${STRATEGY_LABEL[track.strategy]})가 다릅니다`);
  }
  return { org_id: link.org_id, lp_proposal_id: row.id, received_at: row.created_at, result: "received" as const };
}
