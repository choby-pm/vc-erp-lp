import assert from "node:assert/strict";
const GP = "http://localhost:3000",
  LP = "http://localhost:3200";
async function login(base, body) {
  const r = await fetch(base + "/api/v1/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
const gp = await login(GP),
  lp = await login(LP, { org: "a", role: "admin" });
const fund = (await gp("GET", "/funds")).data.find((f) =>
    f.name.startsWith("LP연동"),
  ),
  c = (await lp("GET", "/commitments")).data.find(
    (c) => c.fund_name === fund.name,
  ),
  base = `/funds/${c.fund_id}/report-requests`;
const before = (await lp("GET", base)).data;
const concurrent = await Promise.all([lp("PUT", base), lp("PUT", base)]);
assert.ok(
  concurrent.every((r) => r.status === 200),
  JSON.stringify(concurrent),
);
const after = (await lp("GET", base)).data;
assert.equal(after.receipts.length, before.receipts.length);
console.log("✓ 동시 회신 동기화 2회 성공·수신 이력 중복 없음");
const sharing = `/funds/${fund.id}/sharing`,
  view = (await gp("GET", sharing)).data;
const member = view.members.find((m) => m.name === "하늘연금");
assert.ok(member);
const policy = () =>
  gp("GET", sharing).then((r) =>
    r.data.policies.find(
      (p) => p.lp_id === member.id && p.resource_type === "reports",
    ),
  );
const initial = await policy();
assert.ok(initial);
async function set(allowed, reason) {
  const p = await policy(),
    r = await gp("POST", sharing, {
      lp_id: member.id,
      resource_type: "reports",
      allowed,
      reason,
      previous_id: p.id,
    });
  assert.equal(r.status, 201, JSON.stringify(r));
}
try {
  await set(false, "W05 경계 검증 · 보고 공유 일시 철회");
  const r = await lp("POST", base, {
    as_of: "2028-12-31",
    due_date: "2028-12-31",
    reason: "W05 QA 공유 미허용 업무 거절 검증",
  });
  assert.equal(r.status, 201, JSON.stringify(r));
  assert.equal(r.data.delivery.status, "rejected");
  const local = (await lp("GET", base)).data.requests.find(
    (q) => q.id === r.data.id,
  );
  assert.equal(local.gp_request_id, null);
  assert.equal(local.next_retry_at, null);
  console.log("✓ 공유 미허용 요청은 GP 접수 없음·업무 거절·자동 재시도 없음");
} finally {
  await set(initial.allowed, "W05 경계 검증 종료 · 원래 보고 공유 상태 복구");
}
console.log("W05 추가 경계 2건 통과");
