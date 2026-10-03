import type postgres from "postgres";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { gpClient, type GpActor } from "@/lib/gp/client";
import type { DataSource } from "@/lib/labels";
import type { ManualMeetingInput, MeetingResultsInput, VotesSaveInput } from "@/lib/schemas/meetings";

// 총회 · 투표 (R5-3, BR-VOTE-01~06, L4). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 연동 총회: GP가 소집한 총회·안건·결과가 들어온다. 투표는 GP가 투표를 받는 동안(voting_open)만 (BR-VOTE-01)
// · 투표안: 안건별 찬반 + 내부 검토 의견(GP에 보내지 않음, BR-VOTE-03). 결재 대기 중에는 못 바꾼다 (BR-APR-03)
// · 투표 결재: 모든 안건에 찬반이 있어야 기안 (BR-VOTE-02). 결재는 총회 단위, 스냅샷에 안건·찬반·검토 의견
// · 제출: 승인된 결재의 찬반 = 지금 찬반일 때만. 연동은 GP에 PUT 으로 한 번에 (BR-VOTE-04), 수기는 "서면 제출 완료" 기록
//   제출한 뒤 찬반을 바꾸면 제출 안 됨으로 돌아가고 새 결재가 필요하다 (BR-VOTE-05)
// · GP가 거부하면(투표 마감) 주의 목록 "투표 제출 실패" (BR-VOTE-06). 닿지 못했으면 다시 보낸다 (BR-SYNC-11)

type Db = typeof sql;
export type VoteChoice = "for" | "against" | "abstain";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export type MeetingItem = {
  id: string;
  fund_id: string;
  fund_name: string;
  gp_name: string;
  meeting_type: string;
  meeting_date: string;
  location: string | null;
  status: "scheduled" | "held" | "cancelled";
  voting_open: boolean;
  data_source: DataSource;
  agenda_count: number;
  voted_count: number; // 찬반을 정한 안건 수
  submitted_count: number; // 제출된 안건 수
  pending_approval: boolean;
  vote_submit_error_code: string | null;
  vote_submit_error: string | null;
  vote_submit_attempted_at: Date | null;
  can_vote: boolean;
};
export type AgendaItem = {
  id: string;
  agenda_no: number;
  agenda_type: string;
  title: string;
  description: string | null;
  result: "pending" | "passed" | "rejected";
  review_opinion: string | null;
  choice: VoteChoice | null;
  submitted_at: Date | null;
  gp_vote_channel: "gp" | "lp_system" | null;
};
export type SubmitStatus = "draft" | "awaiting_approval" | "approved_unsent" | "failed" | "submitted";
export type MeetingDetail = MeetingItem & {
  agendas: AgendaItem[];
  latest_approval: { id: string; status: string; approved_matches: boolean } | null;
  submit_status: SubmitStatus;
};

// 투표할 수 있는가: 연동은 GP가 투표를 받는 동안, 수기는 총회일까지 (BR-VOTE-01)
// 요청마다 오늘 날짜로 계산한다 (모듈을 처음 읽을 때 한 번만 계산하면 서버를 오래 켜 둘 때 날짜가 밀린다)
const canVoteSql = (db: Db) => db`(m.status = 'scheduled' and case when m.data_source = 'gp_api' then m.voting_open else m.meeting_date >= ${today()}::date end)`;

const listQuery = (db: Db, orgId: string) => db`
  select m.id, m.fund_id, f.name as fund_name, g.name as gp_name, m.meeting_type, m.meeting_date, m.location, m.status, m.voting_open, m.data_source,
         (select count(*) from agendas a where a.meeting_id = m.id)::int as agenda_count,
         (select count(*) from votes v join agendas a on a.id = v.agenda_id where a.meeting_id = m.id)::int as voted_count,
         (select count(*) from votes v join agendas a on a.id = v.agenda_id where a.meeting_id = m.id and v.submitted_at is not null)::int as submitted_count,
         exists (select 1 from approvals p where p.target_type = 'vote' and p.target_id = m.id and p.status = 'pending') as pending_approval,
         m.vote_submit_error_code, m.vote_submit_error, m.vote_submit_attempted_at,
         ${canVoteSql(db)} as can_vote
  from meetings m join funds f on f.id = m.fund_id join gps g on g.id = f.gp_id
  where m.org_id = ${orgId}
`;

export async function listMeetings(orgId: string, q: { votable?: boolean; fund_id?: string } = {}) {
  return sql<MeetingItem[]>`
    select * from (${listQuery(sql, orgId)}) x
    where true ${q.votable ? sql`and x.can_vote` : sql``} ${q.fund_id ? sql`and x.fund_id = ${q.fund_id}` : sql``}
    order by x.can_vote desc, x.meeting_date desc
    limit 200
  `;
}

// 지금 찬반 vs 마지막으로 승인된 결재의 찬반
async function latestApproval(db: Db, meetingId: string) {
  const [a] = await db<{ id: string; status: string; snapshot: { votes?: { agenda_id: string; choice: VoteChoice }[] } }[]>`
    select id, status, snapshot from approvals where target_type = 'vote' and target_id = ${meetingId} order by requested_at desc limit 1
  `;
  return a ?? null;
}
const sameVotes = (snap: { agenda_id: string; choice: VoteChoice }[] | undefined, agendas: AgendaItem[]) =>
  Boolean(snap) && agendas.length === snap!.length && agendas.every((a) => snap!.some((v) => v.agenda_id === a.id && v.choice === a.choice));

export async function getMeeting(orgId: string, meetingId: string, db: Db = sql): Promise<MeetingDetail> {
  assertUuid(meetingId, "총회를");
  const [m] = await db<MeetingItem[]>`select * from (${listQuery(db, orgId)}) x where x.id = ${meetingId}`;
  if (!m) throw notFound("총회를");
  const agendas = await db<AgendaItem[]>`
    select a.id, a.agenda_no, a.agenda_type, a.title, a.description, a.result, a.review_opinion, v.choice, v.submitted_at, v.gp_vote_channel
    from agendas a left join votes v on v.agenda_id = a.id
    where a.meeting_id = ${meetingId} order by a.agenda_no
  `;
  const a = await latestApproval(db, meetingId);
  const approved_matches = a?.status === "approved" && sameVotes(a.snapshot?.votes, agendas);
  const allSubmitted = agendas.length > 0 && agendas.every((x) => x.submitted_at);
  const submit_status: SubmitStatus = allSubmitted
    ? "submitted"
    : m.pending_approval
      ? "awaiting_approval"
      : approved_matches
        ? m.vote_submit_error_code === "GP_REJECTED"
          ? "failed"
          : "approved_unsent"
        : "draft";
  return { ...m, agendas, latest_approval: a ? { id: a.id, status: a.status, approved_matches } : null, submit_status };
}

async function lockMeeting(tx: postgres.TransactionSql, orgId: string, meetingId: string) {
  const [row] = await tx`select id from meetings where id = ${meetingId} and org_id = ${orgId} for update`;
  if (!row) throw notFound("총회를");
  return getMeeting(orgId, meetingId, tx as unknown as Db);
}

function assertVotable(m: MeetingDetail) {
  if (!m.can_vote) {
    const why = m.status !== "scheduled" ? "개최했거나 취소된 총회입니다" : m.data_source === "gp_api" ? "GP가 투표를 받지 않는 총회입니다" : "총회일이 지났습니다";
    throw new AppError(409, "VOTING_CLOSED", `투표할 수 없습니다 — ${why}`, "BR-VOTE-01");
  }
}

// ─── 투표안 저장 (BR-VOTE-01·03·05, BR-APR-03) ───────────────────────────────

export async function saveVotes(orgId: string, userId: string, meetingId: string, input: VotesSaveInput) {
  await sql.begin(async (tx) => {
    const m = await lockMeeting(tx, orgId, meetingId);
    assertVotable(m);
    if (m.pending_approval) throw new AppError(409, "APPROVAL_PENDING", "투표 결재 대기 중이라 바꿀 수 없습니다", "BR-APR-03");
    for (const v of input.votes) {
      const agenda = m.agendas.find((a) => a.id === v.agenda_id);
      if (!agenda) throw new AppError(422, "VALIDATION_ERROR", "이 총회의 안건이 아닙니다", "BR-VOTE-02", { fields: { agenda_id: v.agenda_id } });
      await tx`update agendas set review_opinion = ${v.review_opinion} where id = ${agenda.id}`;
      if (v.choice === null) {
        await tx`delete from votes where agenda_id = ${agenda.id}`;
      } else if (agenda.choice !== v.choice) {
        // 찬반이 바뀌면 제출 안 됨으로 (다시 제출하려면 새 결재, BR-VOTE-05)
        await tx`
          insert into votes (org_id, agenda_id, choice, created_by) values (${orgId}, ${agenda.id}, ${v.choice}, ${userId})
          on conflict (agenda_id) do update set choice = excluded.choice, submitted_at = null, gp_vote_channel = null
        `;
      }
    }
    await tx`update meetings set vote_submit_error_code = null, vote_submit_error = null where id = ${meetingId}`;
  });
  return getMeeting(orgId, meetingId);
}

// ─── 투표 결재 기안 (BR-VOTE-02, BR-APR-01·04) ───────────────────────────────

export async function requestVoteApproval(orgId: string, userId: string, meetingId: string, comment: string | null) {
  const approvalId = await sql.begin(async (tx) => {
    const m = await lockMeeting(tx, orgId, meetingId);
    assertVotable(m);
    if (m.pending_approval) throw new AppError(409, "APPROVAL_PENDING", "이미 결재 대기 중입니다", "BR-APR-02");
    const missing = m.agendas.filter((a) => !a.choice);
    if (m.agendas.length === 0 || missing.length > 0) {
      throw new AppError(422, "VOTE_INCOMPLETE", `모든 안건에 찬반을 정해야 기안할 수 있습니다 (남은 안건: ${missing.map((a) => `${a.agenda_no}호`).join(", ") || "안건 없음"})`, "BR-VOTE-02");
    }
    if (m.agendas.every((a) => a.submitted_at)) throw new AppError(409, "INVALID_STATE", "이미 제출한 투표입니다. 바꾸려면 찬반을 고친 뒤 다시 기안하세요", "BR-VOTE-05");
    const snapshot = {
      meeting: { fund_name: m.fund_name, gp_name: m.gp_name, meeting_type: m.meeting_type, meeting_date: m.meeting_date, location: m.location, data_source: m.data_source },
      votes: m.agendas.map((a) => ({ agenda_id: a.id, agenda_no: a.agenda_no, agenda_type: a.agenda_type, title: a.title, choice: a.choice, review_opinion: a.review_opinion })),
    };
    const [a] = await tx<{ id: string }[]>`
      insert into approvals (org_id, target_type, target_id, requested_by, request_comment, snapshot)
      values (${orgId}, 'vote', ${meetingId}, ${userId}, ${comment}, ${tx.json(snapshot as never)})
      returning id
    `;
    return a.id;
  });
  return { approval_id: approvalId, meeting: await getMeeting(orgId, meetingId) };
}

// ─── 제출 (BR-VOTE-04·06, BR-SYNC-11) ────────────────────────────────────────

export type VoteSync = { status: "not_needed" | "sent" | "pending" | "rejected"; message?: string };

// 승인된 결재의 찬반을 GP에 제출한다 (연동). 승인 직후·다시 보내기·주기 작업에서 부른다
export async function submitVotes(orgId: string, meetingId: string, actor?: GpActor): Promise<VoteSync> {
  const m = await getMeeting(orgId, meetingId);
  if (m.data_source !== "gp_api") return { status: "not_needed" };
  if (!m.latest_approval?.approved_matches) throw new AppError(409, "APPROVAL_REQUIRED", "승인된 투표 결재와 지금 찬반이 다릅니다. 다시 기안하세요", "BR-VOTE-04");
  if (m.submit_status === "submitted") return { status: "sent" };
  const [ids] = await sql<{ gp_meeting_id: string; gp_fund_id: string; gp_id: string }[]>`
    select m.gp_meeting_id, f.gp_fund_id, f.gp_id from meetings m join funds f on f.id = m.fund_id where m.id = ${meetingId}
  `;
  const agendaIds = await sql<{ id: string; gp_agenda_id: string }[]>`select id, gp_agenda_id from agendas where meeting_id = ${meetingId}`;
  try {
    const gp = await gpClient(orgId, ids.gp_id, actor);
    await gp.put(`/funds/${ids.gp_fund_id}/meetings/${ids.gp_meeting_id}/votes`, {
      votes: m.agendas.map((a) => ({ agenda_id: agendaIds.find((x) => x.id === a.id)!.gp_agenda_id, choice: a.choice })),
    });
  } catch (err) {
    const code = err instanceof AppError ? err.code : "GP_UNAVAILABLE";
    const message = err instanceof Error ? err.message : String(err);
    await sql`update meetings set vote_submit_attempted_at = now(), vote_submit_error_code = ${code}, vote_submit_error = ${message.slice(0, 500)} where id = ${meetingId}`;
    return code === "GP_REJECTED" ? { status: "rejected", message } : { status: "pending", message };
  }
  await sql.begin(async (tx) => {
    await tx`update votes set submitted_at = now(), gp_vote_channel = 'lp_system' where agenda_id in (select id from agendas where meeting_id = ${meetingId})`;
    await tx`update meetings set vote_submit_attempted_at = now(), vote_submit_error_code = null, vote_submit_error = null where id = ${meetingId}`;
  });
  return { status: "sent" };
}

// 수기 총회: 승인된 투표를 서면으로 냈다고 기록 (BR-VOTE-04)
export async function markVotesSubmitted(orgId: string, meetingId: string) {
  const m = await getMeeting(orgId, meetingId);
  if (m.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 총회는 승인되면 GP에 바로 제출됩니다", "BR-VOTE-04");
  if (!m.latest_approval?.approved_matches) throw new AppError(409, "APPROVAL_REQUIRED", "승인된 투표 결재가 없거나 지금 찬반과 다릅니다", "BR-VOTE-04");
  await sql`update votes set submitted_at = coalesce(submitted_at, now()) where agenda_id in (select id from agendas where meeting_id = ${meetingId})`;
  return getMeeting(orgId, meetingId);
}

// 못 보낸 투표 보내기 — 주기 작업(전체)·관리자 "못 보낸 것 지금 보내기"(우리 기관). GP가 거부한 것은 다시 보내지 않는다
export async function sendPendingVotes(orgId: string | null, actor?: GpActor) {
  const rows = await sql<{ id: string; org_id: string }[]>`
    select m.id, m.org_id from meetings m
    where m.data_source = 'gp_api' and m.status = 'scheduled' and m.voting_open
      and m.vote_submit_error_code is distinct from 'GP_REJECTED'
      and (${orgId}::uuid is null or m.org_id = ${orgId}::uuid)
      and exists (select 1 from agendas a join votes v on v.agenda_id = a.id where a.meeting_id = m.id and v.submitted_at is null)
      and (select status from approvals p where p.target_type = 'vote' and p.target_id = m.id order by requested_at desc limit 1) = 'approved'
  `;
  const result = { sent: 0, pending: 0, rejected: 0 };
  for (const r of rows) {
    const m = await getMeeting(r.org_id, r.id);
    if (!m.latest_approval?.approved_matches) continue;
    const s = await submitVotes(r.org_id, r.id, actor);
    if (s.status === "sent") result.sent++;
    else if (s.status === "rejected") result.rejected++;
    else if (s.status === "pending") result.pending++;
  }
  return result;
}

// ─── 수기 총회 (BR-VOTE-01) ──────────────────────────────────────────────────

export async function createManualMeeting(orgId: string, userId: string, fundId: string, input: ManualMeetingInput) {
  assertUuid(fundId, "조합을");
  const id = await sql.begin(async (tx) => {
    const [f] = await tx<{ data_source: DataSource }[]>`select data_source from funds where id = ${fundId} and org_id = ${orgId}`;
    if (!f) throw notFound("조합을");
    if (f.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 조합의 총회는 GP에서 자동으로 들어옵니다", "BR-VOTE-01");
    const [m] = await tx<{ id: string }[]>`
      insert into meetings (org_id, fund_id, meeting_type, meeting_date, location, status, voting_open, data_source, created_by)
      values (${orgId}, ${fundId}, ${input.meeting_type}, ${input.meeting_date}, ${input.location}, 'scheduled', true, 'manual', ${userId})
      returning id
    `;
    let no = 1;
    for (const a of input.agendas) {
      await tx`
        insert into agendas (org_id, meeting_id, agenda_no, agenda_type, title, description)
        values (${orgId}, ${m.id}, ${no++}, ${a.agenda_type}, ${a.title}, ${a.description})
      `;
    }
    return m.id;
  });
  return getMeeting(orgId, id);
}

// 수기 총회 결과 기록: 안건별 가결·부결 → 개최 완료 (연동 총회 결과는 GP에서 받는다, BR-VOTE-06)
export async function recordManualResults(orgId: string, meetingId: string, input: MeetingResultsInput) {
  await sql.begin(async (tx) => {
    const m = await lockMeeting(tx, orgId, meetingId);
    if (m.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 총회의 결과는 GP에서 들어옵니다", "BR-VOTE-06");
    if (m.status !== "scheduled") throw new AppError(409, "INVALID_STATE", "이미 개최했거나 취소된 총회입니다", "BR-VOTE-06");
    if (input.results.length !== m.agendas.length || !m.agendas.every((a) => input.results.some((r) => r.agenda_id === a.id))) {
      throw new AppError(422, "VALIDATION_ERROR", "모든 안건의 결과를 입력하세요", "BR-VOTE-06");
    }
    for (const r of input.results) await tx`update agendas set result = ${r.result} where id = ${r.agenda_id} and meeting_id = ${meetingId}`;
    await tx`update meetings set status = 'held', voting_open = false where id = ${meetingId}`;
  });
  return getMeeting(orgId, meetingId);
}

// ─── 연동 총회 받기 (동기화에서 부른다) ─────────────────────────────────────

type GpMeeting = {
  id: string;
  meeting_type: string;
  meeting_date: string;
  location: string | null;
  status: "scheduled" | "held" | "cancelled";
  voting_open: boolean;
  agendas: { id: string; agenda_no: number; agenda_type: string; title: string; description: string | null; result: "pending" | "passed" | "rejected"; my_vote: VoteChoice | null; my_vote_channel: "gp" | "lp_system" | null }[];
};

// 총회·안건·결과·투표 가능 여부를 GP 값으로. 검토 의견·우리 투표안은 우리 값이라 건드리지 않는다
// GP에 우리 표가 있는데(예: GP가 서면 투표를 대신 기록) 우리에게 없으면, 그 표를 제출된 것으로 남긴다
export async function upsertGpMeetings(orgId: string, fundId: string, meetings: GpMeeting[]) {
  let created = 0;
  for (const g of meetings) {
    await sql.begin(async (tx) => {
      const [m] = await tx<{ id: string; inserted: boolean }[]>`
        insert into meetings (org_id, fund_id, meeting_type, meeting_date, location, status, voting_open, data_source, gp_meeting_id)
        values (${orgId}, ${fundId}, ${g.meeting_type}, ${g.meeting_date}, ${g.location}, ${g.status}, ${g.voting_open}, 'gp_api', ${g.id})
        on conflict (org_id, gp_meeting_id) do update
          set meeting_type = excluded.meeting_type, meeting_date = excluded.meeting_date, location = excluded.location,
              status = excluded.status, voting_open = excluded.voting_open
        returning id, (xmax = 0) as inserted
      `;
      if (m.inserted) created++;
      for (const a of g.agendas) {
        const [ag] = await tx<{ id: string }[]>`
          insert into agendas (org_id, meeting_id, agenda_no, agenda_type, title, description, result, gp_agenda_id)
          values (${orgId}, ${m.id}, ${a.agenda_no}, ${a.agenda_type}, ${a.title}, ${a.description}, ${a.result}, ${a.id})
          on conflict (org_id, gp_agenda_id) do update
            set agenda_no = excluded.agenda_no, agenda_type = excluded.agenda_type, title = excluded.title, description = excluded.description, result = excluded.result
          returning id
        `;
        if (a.my_vote) {
          await tx`
            insert into votes (org_id, agenda_id, choice, submitted_at, gp_vote_channel)
            values (${orgId}, ${ag.id}, ${a.my_vote}, now(), ${a.my_vote_channel})
            on conflict (agenda_id) do update
              set gp_vote_channel = case when votes.choice = excluded.choice then excluded.gp_vote_channel else votes.gp_vote_channel end
          `;
        }
      }
    });
  }
  return { fetched: meetings.length, created };
}
