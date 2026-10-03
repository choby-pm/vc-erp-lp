import { sql } from "@/lib/db";
import { formatKRW } from "@/lib/format";
import type { Role } from "@/lib/auth/roles";
import { checkView } from "@/lib/services/reports";
import { mismatchSince, type EntryType } from "@/lib/services/reconciliation";

// 주의 목록 (R5-4, 04 비즈니스 규칙 14장). 저장하지 않고 매번 계산한다. 모든 항목은 그 기관 것만 (BR-ORG-02)
// · 보고 기한(L35): 출자 건이 활성이 된 날(결성 확인일)이 속한 분기부터, 분기 말 + 45일까지 그 분기 말을 포함하는 보고가 있어야 한다 (L11)
// · 조건 점검(L34): 투자 기간이 끝난 뒤 보고의 미달만 (투자 기간 중 미달은 참고)

export type AlertItem = { title: string; detail: string; href: string; date?: string | null };
export type AlertGroup = { key: string; label: string; tone: "red" | "amber" | "sky" | "slate"; items: AlertItem[] };

const DAY = 86_400_000;
const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const quarterEnd = (d: string) => {
  const y = Number(d.slice(0, 4));
  const q = Math.floor((Number(d.slice(5, 7)) - 1) / 3);
  return new Date(Date.UTC(y, q * 3 + 3, 0)).toISOString().slice(0, 10);
};
const nextQuarterEnd = (qe: string) => quarterEnd(addDays(qe, 1));
const ENTRY_LABEL: Record<string, string> = { commitment: "약정", contribution: "납입", distribution: "분배" };

export async function getAlerts(orgId: string, user: { id: string; role: Role }): Promise<AlertGroup[]> {
  const today = todayStr();
  const groups: AlertGroup[] = [];
  const push = (g: AlertGroup) => g.items.length > 0 && groups.push(g);

  // 1. 결재 대기 — 내가 결재할 것(결재권자·관리자) / 내가 올린 것
  const approvals = await sql<{ id: string; target_type: string; requested_by: string; requested_at: Date; title: string }[]>`
    select a.id, a.target_type, a.requested_by, a.requested_at,
           coalesce(f.name, pf.name, vf.name, '') as title
    from approvals a
    left join proposals p on a.target_type = 'selection' and p.id = a.target_id left join funds f on f.id = p.fund_id
    left join payments pp on a.target_type = 'payment' and pp.id = a.target_id left join capital_calls pc on pc.id = pp.capital_call_id
    left join commitments pm on pm.id = pc.commitment_id left join funds pf on pf.id = pm.fund_id
    left join meetings vm on a.target_type = 'vote' and vm.id = a.target_id left join funds vf on vf.id = vm.fund_id
    where a.org_id = ${orgId} and a.status = 'pending'
    order by a.requested_at
  `;
  const TARGET: Record<string, string> = { selection: "출자 선정", payment: "납입", vote: "총회 투표" };
  const toMe = user.role === "approver" || user.role === "admin" ? approvals.filter((a) => a.requested_by !== user.id) : [];
  push({ key: "approvals_to_me", label: "내가 결재할 것", tone: "amber", items: toMe.map((a) => ({ title: `[${TARGET[a.target_type]}] ${a.title}`, detail: "결재 대기", href: `/approvals/${a.id}`, date: a.requested_at.toISOString().slice(0, 10) })) });
  push({ key: "approvals_mine", label: "내가 올린 결재 (대기 중)", tone: "slate", items: approvals.filter((a) => a.requested_by === user.id).map((a) => ({ title: `[${TARGET[a.target_type]}] ${a.title}`, detail: "결재권자 결정 대기", href: `/approvals/${a.id}` })) });

  // 2. 캐피탈콜 — 기한 경과 · 7일 이내 · 약정 초과 요청
  const calls = await sql<{ id: string; fund_name: string; call_no: number; due_date: string; left: number; data_source: string; over: boolean }[]>`
    select c.id, f.name as fund_name, c.call_no, c.due_date, (c.call_amount - s.paid_amount)::bigint as left, c.data_source,
           (c.data_source = 'gp_api' and sm.called_amount > sm.commitment_amount and sm.commitment_amount > 0) as over
    from capital_calls c join v_capital_call_status s on s.capital_call_id = c.id
    join commitments m on m.id = c.commitment_id join funds f on f.id = m.fund_id join v_commitment_summary sm on sm.commitment_id = c.commitment_id
    where c.org_id = ${orgId} and c.cancelled_at is null and m.status = 'active'
    order by c.due_date
  `;
  const unpaid = calls.filter((c) => Number(c.left) > 0);
  push({ key: "calls_overdue", label: "캐피탈콜 납입 기한 경과", tone: "red", items: unpaid.filter((c) => c.due_date < today).map((c) => ({ title: `${c.fund_name} · ${c.call_no}회`, detail: `미납 ${formatKRW(Number(c.left))}`, href: `/capital-calls/${c.id}`, date: c.due_date })) });
  push({ key: "calls_due", label: "캐피탈콜 납입 기한 7일 이내", tone: "amber", items: unpaid.filter((c) => c.due_date >= today && c.due_date <= addDays(today, 7)).map((c) => ({ title: `${c.fund_name} · ${c.call_no}회`, detail: `남은 금액 ${formatKRW(Number(c.left))}`, href: `/capital-calls/${c.id}`, date: c.due_date })) });
  push({ key: "calls_over", label: "약정 초과 캐피탈콜 (BR-CALL-03)", tone: "red", items: calls.filter((c) => c.over).map((c) => ({ title: `${c.fund_name} · ${c.call_no}회`, detail: "요청 합계가 약정을 넘습니다", href: `/capital-calls/${c.id}` })) });

  // 3. 대사 불일치 7일 경과 (BR-REC-04)
  const recon = await sql<{ commitment_id: string; entry_type: EntryType; our_amount: number; gp_amount: number; fund_name: string }[]>`
    select r.commitment_id, r.entry_type, r.our_amount, r.gp_amount, f.name as fund_name
    from v_recon_current r join commitments m on m.id = r.commitment_id join funds f on f.id = m.fund_id
    where r.org_id = ${orgId} and r.recon_status = 'mismatched'
  `;
  const reconItems: AlertItem[] = [];
  for (const r of recon) {
    const since = await mismatchSince(sql, r.commitment_id, r.entry_type);
    if (since && Date.now() - new Date(since).getTime() >= 7 * DAY) {
      reconItems.push({ title: `${r.fund_name} · ${ENTRY_LABEL[r.entry_type]}`, detail: `우리 ${formatKRW(Number(r.our_amount))} / GP ${formatKRW(Number(r.gp_amount))}`, href: `/commitments/${r.commitment_id}`, date: new Date(since).toISOString().slice(0, 10) });
    }
  }
  push({ key: "recon", label: "대사 불일치 7일 경과", tone: "red", items: reconItems });

  // 4. 결성 기한 30일 이내 · 경과 (결성 대기 출자 건)
  const formation = await sql<{ id: string; fund_name: string; deadline: string }[]>`
    select m.id, f.name as fund_name, t.formation_deadline as deadline
    from commitments m join funds f on f.id = m.fund_id join selection_terms t on t.proposal_id = m.proposal_id
    where m.org_id = ${orgId} and m.status = 'awaiting_formation' and t.formation_deadline <= ${addDays(today, 30)}
    order by t.formation_deadline
  `;
  push({ key: "formation", label: "결성 기한 임박 · 경과", tone: "amber", items: formation.map((f) => ({ title: f.fund_name, detail: f.deadline < today ? "결성 기한이 지났습니다 (자동 취소하지 않음, BR-CMT-05)" : "결성 기한 30일 이내", href: `/commitments/${f.id}`, date: f.deadline })) });

  // 5. 보고 미제출 (L35) · 미검토 (BR-RPT-04) · 조건 점검 미달 (L34)
  const active = await sql<{ fund_id: string; fund_name: string; confirmed_date: string }[]>`
    select m.fund_id, f.name as fund_name, m.confirmed_date from commitments m join funds f on f.id = m.fund_id
    where m.org_id = ${orgId} and m.status = 'active' and m.confirmed_date is not null
  `;
  const covering = await sql<{ fund_id: string; period_start: string; period_end: string }[]>`
    select fund_id, period_start, period_end from reports where org_id = ${orgId} and superseded_at is null
  `;
  const missing: AlertItem[] = [];
  for (const a of active) {
    for (let qe = quarterEnd(a.confirmed_date); addDays(qe, 45) < today; qe = nextQuarterEnd(qe)) {
      if (!covering.some((r) => r.fund_id === a.fund_id && r.period_start <= qe && qe <= r.period_end)) {
        missing.push({ title: `${a.fund_name} · ${qe.slice(0, 4)}년 ${Math.floor(Number(qe.slice(5, 7)) / 3)}분기`, detail: `보고 기한 ${addDays(qe, 45)} 경과`, href: `/funds/${a.fund_id}`, date: addDays(qe, 45) });
      }
    }
  }
  push({ key: "reports_missing", label: "보고 미제출 (분기 말 + 45일)", tone: "red", items: missing });
  const reports = await sql<{ id: string; fund_name: string; period_end: string; reviewed_at: Date | null; check_result: "pass" | "fail" | null; investment_end: string | null }[]>`
    select r.id, f.name as fund_name, r.period_end, r.reviewed_at,
           (select k.result from compliance_checks k where k.report_id = r.id order by k.created_at desc limit 1) as check_result,
           case when f.formation_date is not null and f.investment_period_years is not null
                then (f.formation_date + make_interval(years => f.investment_period_years))::date::text end as investment_end
    from reports r join funds f on f.id = r.fund_id
    where r.org_id = ${orgId} and r.superseded_at is null
    order by r.period_end desc
  `;
  push({ key: "reports_unreviewed", label: "검토하지 않은 GP 보고", tone: "amber", items: reports.filter((r) => !r.reviewed_at).map((r) => ({ title: `${r.fund_name} · 기준일 ${r.period_end}`, detail: "검토 완료 표시 전", href: `/reports/${r.id}` })) });
  push({
    key: "compliance",
    label: "약정 조건 미달 (투자 기간 이후)",
    tone: "red",
    items: reports.filter((r) => r.check_result && checkView(r.check_result, r.period_end, r.investment_end) === "fail").map((r) => ({ title: `${r.fund_name} · 기준일 ${r.period_end}`, detail: "주목적 의무 비율 미달", href: `/reports/${r.id}` })),
  });

  // 5-1. 수령 대기 분배 (R6-1, L39) — GP가 이미 지급했으면 "GP 지급됨 · 수령 기록 전"
  const dists = await sql<{ id: string; fund_name: string; distribution_no: number; distribution_date: string; amount: number; gp_status: string | null }[]>`
    select d.id, f.name as fund_name, d.distribution_no, d.distribution_date, d.amount, d.gp_status
    from distributions d join commitments m on m.id = d.commitment_id join funds f on f.id = m.fund_id
    where d.org_id = ${orgId} and d.status = 'announced'
    order by d.distribution_date
  `;
  push({
    key: "distributions",
    label: "수령 대기 분배",
    tone: "amber",
    items: dists.map((d) => ({ title: `${d.fund_name} · ${d.distribution_no}회`, detail: `${formatKRW(Number(d.amount))}${d.gp_status === "paid" ? " · GP 지급됨, 수령 기록 전" : ""}`, href: "/distributions", date: d.distribution_date })),
  });

  // 6. 총회 — 투표할 것(미제출) · 투표 제출 실패
  const meetings = await sql<{ id: string; fund_name: string; meeting_date: string; can_vote: boolean; all_submitted: boolean; failed: boolean }[]>`
    select m.id, f.name as fund_name, m.meeting_date,
           (m.status = 'scheduled' and case when m.data_source = 'gp_api' then m.voting_open else m.meeting_date >= ${today}::date end) as can_vote,
           not exists (select 1 from agendas a left join votes v on v.agenda_id = a.id where a.meeting_id = m.id and v.submitted_at is null) as all_submitted,
           (m.vote_submit_error_code = 'GP_REJECTED') as failed
    from meetings m join funds f on f.id = m.fund_id
    where m.org_id = ${orgId}
    order by m.meeting_date
  `;
  push({ key: "votes_failed", label: "투표 제출 실패", tone: "red", items: meetings.filter((m) => m.failed).map((m) => ({ title: `${m.fund_name} · ${m.meeting_date} 총회`, detail: "GP가 투표를 거부했습니다 (마감 등)", href: `/meetings/${m.id}` })) });
  push({ key: "votes_open", label: "투표할 총회", tone: "amber", items: meetings.filter((m) => m.can_vote && !m.all_submitted && !m.failed).map((m) => ({ title: `${m.fund_name} · ${m.meeting_date} 총회`, detail: "아직 제출하지 않음", href: `/meetings/${m.id}`, date: m.meeting_date })) });

  // 7. GP에 보내지 못한 것 (BR-SYNC-11) — 제안 응답 · 통지 확인 · 투표
  const [unsent] = await sql<{ responses: number; acks: number; votes: number }[]>`
    select (select count(*) from proposals where org_id = ${orgId} and data_source = 'gp_api' and gp_response_sent_at is null and status not in ('received', 'withdrawn'))::int as responses,
           (select count(*) from notices where org_id = ${orgId} and data_source = 'gp_api' and acknowledged_at is not null and gp_ack_sent_at is null)::int as acks,
           (select count(*) from meetings where org_id = ${orgId} and data_source = 'gp_api' and vote_submit_error_code is not null and vote_submit_error_code <> 'GP_REJECTED')::int as votes
  `;
  const unsentItems: AlertItem[] = [];
  if (unsent.responses) unsentItems.push({ title: `출자 제안 응답 ${unsent.responses}건`, detail: "GP에 아직 전달하지 못함", href: "/integration" });
  if (unsent.acks) unsentItems.push({ title: `통지 확인 ${unsent.acks}건`, detail: "GP에 아직 전달하지 못함", href: "/notices?box=all" });
  if (unsent.votes) unsentItems.push({ title: `승인된 투표 ${unsent.votes}건`, detail: "GP에 아직 제출하지 못함", href: "/meetings?box=all" });
  push({ key: "unsent", label: "GP에 보내지 못한 것", tone: "amber", items: unsentItems });

  // 8. 핵심 운용 인력 변경 (L37)
  const kp = await sql<{ id: string; name: string; changed: Date; now: { name: string; role: string }[]; prev: { name: string; role: string }[] | null }[]>`
    select id, name, key_person_changed_at as changed, gp_key_persons as now, gp_key_persons_prev as prev
    from funds where org_id = ${orgId} and key_person_changed_at is not null and key_person_reviewed_at is null
  `;
  const who = (l: { name: string; role: string }[] | null) => (l ?? []).map((m) => `${m.name}(${m.role === "lead" ? "대표" : "핵심"})`).join(", ") || "없음";
  push({ key: "key_person", label: "핵심 운용 인력 변경", tone: "red", items: kp.map((k) => ({ title: k.name, detail: `${who(k.prev)} → ${who(k.now)}`, href: `/funds/${k.id}`, date: k.changed.toISOString().slice(0, 10) })) });

  // 9. (관리자) 처리 실패 이벤트 (BR-SYNC-07)
  if (user.role === "admin") {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from inbound_events e
      where e.status = 'failed' and exists (select 1 from gp_lp_links l where l.org_id = ${orgId} and l.gp_connection_id = e.gp_connection_id)
    `;
    if (n) push({ key: "events_failed", label: "처리에 실패한 GP 이벤트", tone: "red", items: [{ title: `${n}건`, detail: "GP 연동 화면에서 다시 처리", href: "/integration?status=failed" }] });
  }

  return groups;
}
