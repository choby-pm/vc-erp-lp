// W04 로컬 공유 허용→철회→LP 요청→GP 승인. 끝에 원래 허용 여부로 복구하며 이력은 보존한다.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import postgres from "postgres";
const GP = process.env.QA_GP_URL || "http://localhost:3000",
  LP = process.env.QA_LP_URL || "http://localhost:3200";
for (const u of [GP, LP])
  assert.ok(
    ["localhost", "127.0.0.1"].includes(new URL(u).hostname),
    "로컬 서버만 허용",
  );
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
  return async (method, path, body) => {
    const r = await fetch(base + "/api/v1" + path, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, ...(await r.json()) };
  };
}
const db = postgres(process.env.APP_DATABASE_URL || process.env.DATABASE_URL, {
  prepare: false,
});
let checks = 0;
const check = (ok, label) => {
  assert.ok(ok, label);
  checks++;
  console.log(`✓ ${label}`);
};
const gp = await session(GP),
  lp = await session(LP, { org: "a", role: "admin" }),
  other = await session(LP, { org: "b", role: "admin" });
const fund = (await gp("GET", "/funds")).data.find((f) =>
  f.name.startsWith("LP연동"),
);
const c = (await lp("GET", "/commitments")).data.find(
  (c) => c.fund_name === fund.name,
);
const b = (await other("GET", "/commitments")).data.find(
  (c) => c.fund_name === fund.name,
);
assert.ok(c && b);
const [link] =
  await db`select l.gp_lp_id,c.api_key_env from gp_lp_links l join gp_connections c on c.id=l.gp_connection_id where l.org_id=(select org_id from commitments where id=${c.id})`;
const direct = async (path) => {
  const r = await fetch(
    `${GP}/api/lp/v1/lps/${link.gp_lp_id}/funds/${fund.id}${path}`,
    { headers: { Authorization: `Bearer ${process.env[link.api_key_env]}` } },
  );
  return { status: r.status, ...(await r.json()) };
};
const states = () => lp("GET", `/funds/${c.fund_id}/sharing`);
const initial = await states();
assert.equal(initial.status, 200, JSON.stringify(initial));
const beforeReports = (await lp("GET", `/reports?fund_id=${c.fund_id}`)).data;
const report = beforeReports[0];
assert.ok(report);
const old = (await lp("GET", `/reports/${report.id}`)).data.snapshot;
async function set(kind, allowed, reason) {
  const current = (
    await gp("GET", `/funds/${fund.id}/sharing`)
  ).data.policies.find(
    (p) => p.lp_id === link.gp_lp_id && p.resource_type === kind,
  );
  const r = await gp("POST", `/funds/${fund.id}/sharing`, {
    lp_id: link.gp_lp_id,
    resource_type: kind,
    allowed,
    reason,
    previous_id: current?.id ?? null,
  });
  assert.equal(r.status, 201, JSON.stringify(r));
  return r.data;
}
const observations = [];
try {
  await set("reports", false, "W04 로컬 QA · 보고 공유 철회");
  let d = await direct("/reports");
  check(
    d.status === 403 && d.error.code === "SHARING_DENIED",
    "GP 보고 직접 API 403",
  );
  const eventResponse = await fetch(`${GP}/api/lp/v1/events?limit=500`, {
    headers: { Authorization: `Bearer ${process.env[link.api_key_env]}` },
  });
  const events = (await eventResponse.json()).data;
  const hidden = events.filter(
    (e) => e.lp_id === link.gp_lp_id && e.data?.redacted === true,
  );
  check(
    hidden.length > 0 &&
      hidden.every(
        (e) => !e.data.title && !e.data.report_id && !e.data.notice_id,
      ),
    "이벤트 조회에서 철회 자료 제목·문서 ID 제거, 커서 유지",
  );
  check(
    (await states()).data.snapshot.resources.find(
      (s) => s.resource_type === "reports",
    ).allowed === false,
    "LP 현재 공유 상태 철회 일치",
  );
  const preserved = await lp("GET", `/reports/${report.id}`);
  assert.deepEqual(preserved.data.snapshot, old);
  check(preserved.status === 200, "기존 LP 보고 스냅샷 보존");
  const reviewed = await lp("POST", `/reports/${report.id}/review`);
  check(
    reviewed.status === 409 && reviewed.error.code === "SHARING_REVOKED",
    "철회 전 수신본 검토 변경 차단",
  );
  const sync = await lp("POST", `/funds/${c.fund_id}/resync`);
  check(
    sync.status === 200 && sync.data.reports?.skipped === "sharing_not_allowed",
    "공유 미허용 보고를 건너뛰고 필수 원장 동기화 성공",
  );
  check(
    (
      await other("GET", `/funds/${b.fund_id}/sharing`)
    ).data.snapshot.resources.find((s) => s.resource_type === "reports")
      .allowed === true,
    "같은 조합 다른 기관 공유 유지",
  );
  check(
    (await other("GET", `/funds/${c.fund_id}/sharing`)).status === 404,
    "타 기관 직접 공유 URL 404",
  );
  const requested = await lp("POST", `/funds/${c.fund_id}/sharing/requests`, {
    resource_type: "reports",
    reason: "W04 로컬 QA · 보고 재공유 요청",
  });
  check(requested.status === 201, "LP 공유 확대 요청");
  const duplicate = await lp("POST", `/funds/${c.fund_id}/sharing/requests`, {
    resource_type: "reports",
    reason: "중복 요청 QA",
  });
  check(duplicate.status === 409, "대기 중 중복 요청 차단");
  const decision = await gp(
    "POST",
    `/funds/${fund.id}/sharing/requests/${requested.data.id}/decision`,
    { approved: true, reason: "W04 로컬 QA · GP 관리자 재공유 승인" },
  );
  check(decision.status === 200, "GP 관리자 요청 승인");
  check(
    (await direct("/reports")).status === 200,
    "승인 시점부터 GP 보고 재조회",
  );
  check(
    (await states()).data.snapshot.requests.find(
      (r) => r.id === requested.data.id,
    ).approved === true,
    "LP 요청 승인 상태 수신",
  );
  await set("obligations", false, "W04 로컬 QA · 의무 근거 공유 철회");
  check(
    (await direct("/obligations?as_of=2026-10-16")).status === 403,
    "GP 의무 직접 API 403",
  );
  const denied = await lp(
    "GET",
    `/commitments/${c.id}/obligations?as_of=2026-10-16`,
  );
  check(
    denied.status === 403 && denied.error.code === "SHARING_NOT_ALLOWED",
    "LP 의무 조회 공유 미허용 구분",
  );
  await set("attachments", false, "W04 로컬 QA · 첨부 철회");
  check(
    (await direct(`/attachments/${crypto.randomUUID()}`)).status === 403,
    "첨부 직접 경로는 파일 조회 전 공유 차단",
  );
  observations.push({
    fund_id: fund.id,
    lp_fund_id: c.fund_id,
    report_id: report.id,
    request_id: requested.data.id,
    checks,
  });
} finally {
  for (const s of initial.data.snapshot.resources)
    await set(
      s.resource_type,
      s.allowed,
      "W04 로컬 QA 종료 · 원래 허용 여부 복구",
    );
  await states();
  await db.end();
}
await fs.writeFile(
  "docs/qa-reports/2026-10-17-w04-api.json",
  JSON.stringify({ checks, observations }, null, 2),
);
console.log(`W04 API ${checks}건 통과 · 원래 허용 여부 복구, 변경 이력 보존`);
