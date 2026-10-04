import { sql } from "@/lib/db";
import { assertUuid, notFound } from "@/lib/api/errors";
import type { ProgramStatus, Strategy } from "@/lib/labels";

// 출자사업 공고 게시판 (R8-1, L50·L51)
// · 이 서비스를 쓰는 모든 기관의 접수 중 · 심사 중 공고를 모아 보여준다 — **기관 분리의 유일한 예외**.
//   v_board_programs 뷰가 내보내는 공고 항목만 읽는다 (예산 · 내부 메모 · 접수 현황 · 제안은 없음)
// · 보는 사람: LP ERP에 로그인한 모든 기관 사용자(내부 API), 연동 GP(서명한 요청, GP용 API)
// · 현업 ⚠️: 기관은 공고를 올리고 GP가 찾아와 지원한다. 다른 LP는 공고에 지원하지 않는다 (공고는 GP를 뽑는 절차)

export type BoardTrack = {
  id: string;
  name: string;
  strategy: Strategy;
  planned_amount: number;
  target_gp_count: number;
  min_fund_size_amount: number | null;
  max_commitment_ratio: number | null;
};

export type BoardProgram = {
  id: string;
  org_id: string;
  org_name: string;
  name: string;
  apply_start_date: string;
  apply_end_date: string;
  status: Extract<ProgramStatus, "open" | "reviewing">;
  apply_guide: string | null;
  source: "internal" | "external";
  source_url: string | null;
  updated_at: Date;
  days_left: number | null; // 접수 마감까지 남은 날 (접수 중일 때만, 오늘 마감 = 0)
  tracks: BoardTrack[];
};

export type BoardFilter = { strategy?: Strategy; org_id?: string; status?: "open" | "reviewing" };

const todayKst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const DAY = 86_400_000;

async function load(where: { id?: string } & BoardFilter): Promise<BoardProgram[]> {
  const rows = await sql<Omit<BoardProgram, "tracks" | "days_left">[]>`
    select id, org_id, org_name, name, apply_start_date::text, apply_end_date::text, status, apply_guide, source, source_url, updated_at
    from v_board_programs
    where true
      ${where.id ? sql`and id = ${where.id}` : sql``}
      ${where.org_id ? sql`and org_id = ${where.org_id}` : sql``}
      ${where.status ? sql`and status = ${where.status}` : sql``}
    order by (status = 'open') desc, apply_end_date, name
  `;
  if (rows.length === 0) return [];
  const tracks = await sql<(BoardTrack & { program_id: string; max_commitment_ratio: string | null })[]>`
    select program_id, id, name, strategy, planned_amount, target_gp_count, min_fund_size_amount, max_commitment_ratio
    from program_tracks where program_id in ${sql(rows.map((r) => r.id))}
    order by created_at
  `;
  const today = todayKst();
  const programs = rows.map((r) => ({
    ...r,
    days_left: r.status === "open" ? Math.round((Date.parse(r.apply_end_date) - Date.parse(today)) / DAY) : null,
    tracks: tracks
      .filter((t) => t.program_id === r.id)
      .map((t) => ({
        id: t.id,
        name: t.name,
        strategy: t.strategy,
        target_gp_count: t.target_gp_count,
        planned_amount: Number(t.planned_amount),
        min_fund_size_amount: t.min_fund_size_amount === null ? null : Number(t.min_fund_size_amount),
        max_commitment_ratio: t.max_commitment_ratio === null ? null : Number(t.max_commitment_ratio),
      })),
  }));
  // 분야로 찾기: 그 분야 부문이 하나라도 있는 공고
  return where.strategy ? programs.filter((p) => p.tracks.some((t) => t.strategy === where.strategy)) : programs;
}

export async function listBoard(filter: BoardFilter = {}) {
  return load(filter);
}

export async function getBoardProgram(programId: string) {
  assertUuid(programId, "공고를");
  const [p] = await load({ id: programId });
  if (!p) throw notFound("공고를"); // 작성 중 · 선정 완료 공고는 게시판에 없다
  return p;
}

// GP용: 이 연결(GP)이 어느 기관과 연동돼 있는지 함께 알려준다 → GP 화면에서 "GP ERP에서 지원" / "기관 창구로" (L51)
export async function listBoardForGp(connectionId: string, filter: BoardFilter = {}) {
  const links = await sql<{ org_id: string }[]>`select distinct org_id from gp_lp_links where gp_connection_id = ${connectionId}`;
  const linked = new Set(links.map((l) => l.org_id));
  return (await load(filter)).map(({ org_id, updated_at, ...p }) => ({ ...p, org_id, updated_at, linked: linked.has(org_id) }));
}
