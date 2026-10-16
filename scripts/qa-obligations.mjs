// W03 로컬 API QA. 공개 배포에는 실행하지 않는다. --prepare-demo는 가상 의무 2개만 추가한다.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import postgres from "postgres";
if (process.argv.includes("--config")) {
  const db = postgres(
    process.env.APP_DATABASE_URL || process.env.DATABASE_URL,
    { prepare: false },
  );
  try {
    for (const c of await db`select base_url_env from gp_connections`)
      console.log({
        key: c.base_url_env,
        origin: new URL(process.env[c.base_url_env]).origin,
      });
  } finally {
    await db.end();
  }
  process.exit(0);
}
const GP = process.env.QA_GP_URL || "http://localhost:3000",
  LP = process.env.QA_LP_URL || "http://localhost:3200";
for (const base of [GP, LP])
  assert.ok(
    ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
    "로컬 서버에서만 실행합니다",
  );
async function session(base, body) {
  const login = await fetch(base + "/api/v1/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return async (method, path, body) => {
    const res = await fetch(base + "/api/v1" + path, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json()) };
  };
}
const gp = await session(GP),
  lp = await session(LP, { org: "a", role: "admin" });
const funds = (await gp("GET", "/funds")).data;
const fund = funds.find((f) => f.name.startsWith("LP연동"));
assert.ok(fund);
const base = `/funds/${fund.id}`;
const terms = (await gp("GET", base + "/terms")).data.versions.at(-1);
const investments = (await gp("GET", base + "/investments")).data.investments;
const investment = [...investments].sort((a, b) =>
  a.investment_date.localeCompare(b.investment_date),
)[0];
assert.ok(investment);
let versions = (await gp("GET", base + "/obligations")).data.versions;
if (process.argv.includes("--prepare-demo")) {
  for (const [name, measure, direction, threshold, end] of [
    [
      "W03 데모 · 기술기업 최소 투자",
      "commitment_ratio",
      "minimum",
      2000,
      "2028-12-31",
    ],
    ["W03 데모 · 집중투자 한도", "amount", "maximum", 500000000, "2027-12-31"],
  ]) {
    let o = versions.find((o) => o.name === name);
    if (!o) {
      const created = await gp("POST", base + "/obligations", {
        terms_id: terms.id,
        name,
        measure,
        direction,
        threshold,
        period_start: "2025-01-01",
        period_end: end,
        effective_date: terms.effective_date,
        clause_reference: "검증용 가상 규약 제1조",
        clause_text:
          "W03 기능 검증을 위한 가상 조항입니다. 실제 조합 규약이 아닙니다.",
        change_reason: "로컬 W03 데모 근거·복수 의무 검증",
      });
      assert.equal(created.status, 201, JSON.stringify(created));
      o = { id: created.data.id };
    }
    const history = (
      await gp("GET", base + `/obligations/${o.id}/recognitions`)
    ).data;
    const current = history.find(
      (r) => r.current && r.investment_id === investment.id,
    );
    if (
      !current ||
      current.retroactive !== investment.investment_date < terms.effective_date
    ) {
      const res = await gp("POST", base + `/obligations/${o.id}/recognitions`, {
        investment_id: investment.id,
        previous_id: current?.id ?? null,
        recognized_amount: Math.min(investment.investment_amount, 600000000),
        decision: "recognized",
        public_reason: "가상 데모 조항에 해당한다고 담당자 수동 판정 · 검증용",
        retroactive: investment.investment_date < terms.effective_date,
      });
      assert.equal(res.status, 201, JSON.stringify(res));
    }
  }
  versions = (await gp("GET", base + "/obligations")).data.versions;
}
const o = versions.find((o) => o.name.startsWith("W03 데모"));
assert.ok(o, "먼저 --prepare-demo로 가상 의무를 준비하세요");
const history = (await gp("GET", base + `/obligations/${o.id}/recognitions`))
  .data;
const current = history.find(
  (r) => r.current && r.investment_id === investment.id,
);
const reject = await gp("POST", base + `/obligations/${o.id}/recognitions`, {
  investment_id: investment.id,
  previous_id: current?.id ?? null,
  recognized_amount: investment.investment_amount + 1,
  decision: "recognized",
  public_reason: "한도 초과 차단 QA",
  retroactive: true,
});
assert.equal(reject.status, 422);
assert.equal(reject.error.code, "EXCEEDS_INVESTMENT");
const stale = await gp("POST", base + `/obligations/${o.id}/recognitions`, {
  investment_id: investment.id,
  previous_id: null,
  recognized_amount: 1,
  decision: "recognized",
  public_reason: "중복·오래된 판정 차단 QA",
  retroactive: true,
});
assert.equal(stale.status, 409);
assert.equal(stale.error.code, "STALE_RECOGNITION");
const commitment = (await lp("GET", "/commitments")).data.find(
  (c) => c.fund_name === fund.name,
);
assert.ok(commitment);
const asOf = "2026-10-16";
const g = (await gp("GET", base + `/obligations?as_of=${asOf}`)).data;
const l = await lp(
  "GET",
  `/commitments/${commitment.id}/obligations?as_of=${asOf}`,
);
assert.equal(l.status, 200, JSON.stringify(l));
assert.deepEqual(l.data.snapshot, {
  as_of: g.as_of,
  policy_version: g.policy_version,
  obligations: g.obligations,
});
const encoded = JSON.stringify(l.data.snapshot);
for (const key of [
  "decided_by",
  "decided_by_name",
  "investment_amount",
  "created_by",
])
  assert.ok(!encoded.includes(`"${key}"`), `공개 응답에 ${key}가 있습니다`);
const other = await session(LP, { org: "b", role: "admin" });
const isolated = await other(
  "GET",
  `/commitments/${commitment.id}/obligations?as_of=${asOf}`,
);
assert.equal(isolated.status, 404);
const bad = await lp(
  "GET",
  `/commitments/${commitment.id}/obligations?as_of=2026-02-30`,
);
assert.equal(bad.status, 400);
const proof = {
  fund_id: fund.id,
  commitment_id: commitment.id,
  investment_id: investment.id,
  as_of: asOf,
  checks: [
    "집행 원금 초과 차단",
    "오래된 판정 차단",
    "동일 거래 복수 의무",
    "GP·LP 동일 응답",
    "개인정보·내부필드 제외",
    "타 기관 404",
    "잘못된 날짜 400",
  ],
  snapshot: l.data.snapshot,
};
await fs.writeFile(
  "docs/qa-reports/2026-10-16-w03-api.json",
  JSON.stringify(proof, null, 2),
);
console.log(
  JSON.stringify(
    {
      fund_id: fund.id,
      commitment_id: commitment.id,
      investment_id: investment.id,
      checks: proof.checks,
      obligations: proof.snapshot.obligations.map((o) => ({
        name: o.name,
        result: o.result,
        amount: o.recognized_amount,
      })),
    },
    null,
    2,
  ),
);
