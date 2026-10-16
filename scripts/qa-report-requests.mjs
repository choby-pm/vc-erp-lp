// 로컬 데모에 명시적인 W05 요청·정정 보고를 남긴다. 원본 보고·회신은 삭제하지 않는다.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
const GP = process.env.QA_GP_URL || "http://localhost:3000",
  LP = process.env.QA_LP_URL || "http://localhost:3200";
for (const u of [GP, LP])
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(u).hostname));
async function session(base, body) {
  const r = await fetch(base + "/api/v1/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(r.status, 200);
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return async (method, p, body) => {
    const r = await fetch(base + "/api/v1" + p, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, ...(await r.json()) };
  };
}
let checks = 0;
const observations = [];
function check(ok, label) {
  assert.ok(ok, label);
  checks++;
  console.log(`✓ ${label}`);
  observations.push(label);
}
const gp = await session(GP),
  lp = await session(LP, { org: "a", role: "admin" }),
  other = await session(LP, { org: "b", role: "admin" });
const fund = (await gp("GET", "/funds")).data.find((f) =>
    f.name.startsWith("LP연동"),
  ),
  commitment = (await lp("GET", "/commitments")).data.find(
    (c) => c.fund_name === fund.name,
  );
assert.ok(commitment);
const base = `/funds/${commitment.fund_id}/report-requests`,
  gb = `/funds/${fund.id}/report-requests`;
const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve(".") } }),
  { sql } = await jiti.import("@/lib/db.ts");
const { createLocalRequest, deliverReportRequest } = await jiti.import(
  "@/lib/services/report-requests.ts",
);
const [user] =
  await sql`select u.id,u.name,u.role,u.org_id from users u join commitments c on c.org_id=u.org_id where c.id=${commitment.id} and u.role='admin' limit 1`;
const [link] =
  await sql`select l.gp_lp_id,c.api_key_env,c.base_url_env from gp_lp_links l join gp_connections c on c.id=l.gp_connection_id where l.org_id=${user.org_id}`;
async function direct(method, p, body) {
  const r = await fetch(
    `${GP}/api/lp/v1/lps/${link.gp_lp_id}/funds/${fund.id}/report-requests${p}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env[link.api_key_env]}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  return { status: r.status, ...(await r.json()) };
}
async function fresh() {
  const r = await lp("PUT", base);
  assert.equal(r.status, 200, JSON.stringify(r));
  return (await lp("GET", base)).data;
}
async function create(as_of) {
  const r = await lp("POST", base, {
    as_of,
    due_date: as_of,
    reason: "W05 로컬 QA · 분기 운용 보고 요청",
  });
  assert.equal(r.status, 201, JSON.stringify(r));
  await fresh();
  const state = (await lp("GET", base)).data.requests.find(
    (q) => q.id === r.data.id,
  );
  assert.ok(state?.gp_request_id);
  return state;
}
try {
  const existing = (await lp("GET", base)).data.requests;
  for (const q of existing.filter(
    (q) =>
      q.reason.startsWith("W05 로컬 QA") &&
      ["requested", "acknowledged", "replied"].includes(q.snapshot?.status),
  ))
    await lp("POST", `${base}/${q.id}`, {
      action: "cancel",
      reason: "W05 QA 실패 재실행 전 진행 중 테스트 요청 취소",
    });
  check(
    (
      await lp("POST", base, {
        as_of: "2026-02-30",
        due_date: "2026-03-31",
        reason: "잘못된 날짜",
      })
    ).status === 400,
    "존재하지 않는 날짜 차단",
  );
  check(
    (
      await lp("POST", base, {
        as_of: "2026-06-29",
        due_date: "2026-06-30",
        reason: "분기말 아님",
      })
    ).status === 400,
    "분기 종료일 외 기준일 차단",
  );
  check((await other("GET", base)).status === 404, "타 기관 요청 조회 차단");
  const r = await create("2026-06-30");
  check(
    r.snapshot.status === "requested" && r.snapshot.overdue,
    "전송 성공 후 GP 접수 대기·기한 경과, 완료 아님",
  );
  check(
    (
      await lp("POST", base, {
        as_of: r.as_of,
        due_date: r.due_date,
        reason: "중복",
      })
    ).status === 409,
    "진행 중 같은 기준일 중복 차단",
  );
  const idem = await direct("POST", "", {
    client_id: r.id,
    as_of: r.as_of,
    due_date: r.due_date,
    reason: r.reason,
    requester: r.requester,
  });
  check(
    idem.status === 201 && idem.data.id === r.gp_request_id,
    "응답 유실 재전송은 같은 GP 요청으로 멱등 처리",
  );
  const { authorize } = await jiti.import(
    path.resolve("../gp/lib/auth/permissions.ts"),
  );
  check(
    !authorize("viewer", "POST", `${gb}/${r.gp_request_id}`).allowed,
    "GP 조회 역할 처리 차단 규칙",
  );
  check(
    (await fetch(`${GP}/api/v1${gb}/${r.gp_request_id}`, { method: "POST" }))
      .status === 401,
    "GP 미로그인 처리 HTTP 401",
  );
  assert.equal(
    (
      await gp("POST", `${gb}/${r.gp_request_id}`, {
        action: "acknowledge",
        reason: "W05 QA 접수 확인",
      })
    ).status,
    200,
  );
  let reports = (await gp("GET", `/funds/${fund.id}/reports`)).data.reports;
  const report = reports
    .filter(
      (p) =>
        p.status === "published" &&
        p.period_type === "quarterly" &&
        p.period_end === "2026-06-30",
    )
    .at(-1);
  assert.ok(report);
  const before = (await gp("GET", `/funds/${fund.id}/reports/${report.id}`))
    .data.snapshot;
  check(
    (
      await gp("POST", `${gb}/${r.gp_request_id}`, {
        action: "reply",
        report_id: crypto.randomUUID(),
        reason: "기간 불일치 테스트",
      })
    ).status === 422,
    "발행·조합·기준일 맞는 보고만 회신",
  );
  const reply = await gp("POST", `${gb}/${r.gp_request_id}`, {
    action: "reply",
    report_id: report.id,
    reason: "W05 QA 첫 회신",
  });
  check(
    reply.status === 200 && reply.data.status === "replied",
    "GP 회신 저장 시 LP 수신 대기 상태",
  );
  let data = await fresh(),
    done = data.requests.find((q) => q.id === r.id);
  check(
    done.snapshot.status === "received" &&
      data.receipts.some((c) => c.request_id === r.id && c.gp_ack_at),
    "LP 보고 저장→수신 확인 후 업무 완료",
  );
  const first = data.receipts.find((c) => c.request_id === r.id),
    oldLocal = (await lp("GET", `/reports/${first.report_id}`)).data.snapshot;
  await fresh();
  data = await fresh();
  check(
    data.receipts.filter((c) => c.request_id === r.id).length === 1,
    "반복 수신·확인 중복 기록 없음",
  );
  check(
    (
      await lp("POST", `${base}/${r.id}`, {
        action: "cancel",
        reason: "완료 취소 테스트",
      })
    ).status === 409,
    "수신 완료 요청 취소 차단",
  );
  const draft = await gp("POST", `/funds/${fund.id}/reports`, {
    period_type: "quarterly",
    year: 2026,
    period_no: 2,
    gp_comment: "W05 로컬 QA 정정 회신 · 기존 보고 보존 검증",
  });
  assert.equal(draft.status, 201, JSON.stringify(draft));
  const published = await gp(
    "POST",
    `/funds/${fund.id}/reports/${draft.data.id}/publish`,
  );
  assert.equal(published.status, 200, JSON.stringify(published));
  assert.equal(
    (
      await gp("POST", `${gb}/${r.gp_request_id}`, {
        action: "reply",
        report_id: draft.data.id,
        reason: "W05 QA 같은 분기 새 정정 회신",
      })
    ).status,
    200,
  );
  data = await fresh();
  done = data.requests.find((q) => q.id === r.id);
  check(
    done.snapshot.status === "received" &&
      data.receipts.filter((c) => c.request_id === r.id).length === 2,
    "정정 발행 보고 새 회신 v2·수신 이력 보존",
  );
  check(
    JSON.stringify(
      (await lp("GET", `/reports/${first.report_id}`)).data.snapshot,
    ) === JSON.stringify(oldLocal) &&
      JSON.stringify(
        (await gp("GET", `/funds/${fund.id}/reports/${report.id}`)).data
          .snapshot,
      ) === JSON.stringify(before),
    "정정 후 GP 원본·LP 이전 수신 스냅샷 보존",
  );
  check(
    (
      await gp("POST", `${gb}/${r.gp_request_id}`, {
        action: "reply",
        report_id: report.id,
        reason: "이전 버전 회귀 테스트",
      })
    ).status === 422,
    "이전 발행본으로 정정 회신 역행 차단",
  );
  const cancelled = await create("2027-03-31");
  assert.equal(
    (
      await lp("POST", `${base}/${cancelled.id}`, {
        action: "cancel",
        reason: "W05 QA 완료 전 취소",
      })
    ).status,
    200,
  );
  data = await fresh();
  check(
    data.requests.find((q) => q.id === cancelled.id).snapshot.status ===
      "cancelled",
    "완료 전 LP 취소와 사유 이력",
  );
  const unavailable = await create("2027-06-30");
  assert.equal(
    (
      await gp("POST", `${gb}/${unavailable.gp_request_id}`, {
        action: "unavailable",
        reason: "W05 QA 자료 미확정으로 회신 불가",
      })
    ).status,
    200,
  );
  data = await fresh();
  check(
    data.requests.find((q) => q.id === unavailable.id).snapshot.status ===
      "unavailable",
    "회신 불가는 전송 장애와 별도 업무 종료",
  );
  const oldUrl = process.env[link.base_url_env];
  let pending;
  try {
    process.env[link.base_url_env] = "http://127.0.0.1:1";
    pending = await createLocalRequest(
      user.org_id,
      commitment.fund_id,
      {
        as_of: "2027-09-30",
        due_date: "2027-09-30",
        reason: "W05 QA 일시 장애 후 같은 요청 재전송",
      },
      user,
    );
  } finally {
    process.env[link.base_url_env] = oldUrl;
  }
  check(
    pending.delivery.status === "pending",
    "GP 접속 장애는 로컬 요청 보존·재시도 대기",
  );
  const delivered = await deliverReportRequest(
    user.org_id,
    commitment.fund_id,
    pending.id,
    { type: "user", user },
  );
  check(delivered.status === "sent", "연결 복구 후 같은 요청 ID 재전송 성공");
  await lp("POST", `${base}/${pending.id}`, {
    action: "cancel",
    reason: "W05 장애 검증 종료",
  });
  observations.push({
    request_id: r.id,
    gp_request_id: r.gp_request_id,
    first_report_id: report.id,
    correction_report_id: draft.data.id,
  });
} finally {
  await sql.end();
}
await fs.writeFile(
  "docs/qa-reports/2026-10-17-w05-api.json",
  JSON.stringify({ checks, observations }, null, 2),
);
console.log(`W05 ${checks}건 통과 · 로컬 QA 요청·정정 보고 이력 보존`);
