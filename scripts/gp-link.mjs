// GP 시스템 연동 설정 (R3-2, 05 API 설계 3-13)
//
// 연동 설정은 기관이 아니라 서비스 운영자가 하는 일이라 화면 없이 이 스크립트로 넣는다.
//   ① gp_connections: GP 시스템 하나와의 연결 (없으면 만든다). 주소·키·서명 비밀 값은 환경 변수 이름만 저장 (L21)
//   ② GP에 이 출자자 ID가 정말 있는지 GP 연동 API로 확인 (키·주소가 맞는지도 함께 확인된다)
//   ③ 그 기관의 운용사 목록에 연동 GP 한 줄 (gp_connection_id 채움)
//   ④ gp_lp_links: "이 기관 = GP의 이 출자자" 연결. 한 기관은 한 GP에서 출자자 하나, GP 출자자 하나는 기관 하나에만 (DB 유일 제약)
//
// · 다시 실행해도 같은 결과다 (이미 있으면 건너뛴다)
// · 이미 다른 GP 출자자에 연결된 기관을 바꾸는 기능은 없다 (연결을 바꾸면 받은 데이터가 어긋나므로 따로 정리해야 한다)
//
// 사용법:
//   npm run gp:link -- --org a --gp-lp-id <GP 출자자 ID>
//   선택: --gp-name "운용사 이름" (기본: VC ERP 데모 운용사)  --connection "연결 이름" (기본: VC ERP (GP) 데모)  --env GP_DEMO (환경 변수 앞부분)
//   GP 출자자 ID는 GP의 `npm run db:seed-lp-demo` 출력 끝이나 GP 화면 출자자 상세 주소에서 확인한다

import path from 'node:path';
import { parseArgs } from 'node:util';
import { createJiti } from 'jiti';

const DEMO_ORGS = { a: '0a000000-0000-4000-8000-00000000000a', b: '0b000000-0000-4000-8000-00000000000b' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { values: args } = parseArgs({
  options: {
    org: { type: 'string' },
    'gp-lp-id': { type: 'string' },
    'gp-name': { type: 'string', default: 'VC ERP 데모 운용사' },
    connection: { type: 'string', default: 'VC ERP (GP) 데모' },
    env: { type: 'string', default: 'GP_DEMO' },
  },
});

const orgId = DEMO_ORGS[args.org] ?? args.org;
const gpLpId = args['gp-lp-id'];
if (!orgId || !UUID.test(orgId) || !gpLpId || !UUID.test(gpLpId)) {
  console.error('사용법: npm run gp:link -- --org a|b|<기관 ID> --gp-lp-id <GP 출자자 ID>');
  process.exit(1);
}

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const { verifyGpLp, connectionEnv } = await jiti.import('@/lib/gp/client.ts');

const fail = async (message) => {
  console.error(`✖ ${message}`);
  await sql.end();
  process.exit(1);
};

try {
  const [org] = await sql`select id, name from orgs where id = ${orgId}`;
  if (!org) await fail(`기관을 찾을 수 없습니다: ${orgId}`);

  // ① 연결
  const envNames = { base_url_env: `${args.env}_BASE_URL`, api_key_env: `${args.env}_API_KEY`, webhook_secret_env: `${args.env}_WEBHOOK_SECRET` };
  await sql`insert into gp_connections ${sql({ name: args.connection, ...envNames })} on conflict (name) do nothing`;
  const [connection] = await sql`select id, name, base_url_env, api_key_env, webhook_secret_env from gp_connections where name = ${args.connection}`;
  console.log(`• 연결 '${connection.name}' (${connection.id})`);
  connectionEnv(connection); // 주소·키 변수가 비어 있으면 여기서 멈춘다
  if (!process.env[connection.webhook_secret_env]) await fail(`환경 변수 ${connection.webhook_secret_env} 이(가) 비어 있습니다`);

  // ② GP에 확인
  let gpLp;
  try {
    gpLp = await verifyGpLp(connection, gpLpId);
  } catch (err) {
    await fail(`GP 확인 실패: ${err.message}`);
  }
  console.log(`• GP 확인: 출자자 '${gpLp.name}' (${gpLp.lp_type})`);

  await sql.begin(async (tx) => {
    // ③ 운용사
    let [gp] = await tx`select id, gp_connection_id from gps where org_id = ${org.id} and name = ${args['gp-name']}`;
    if (gp && gp.gp_connection_id !== connection.id) {
      throw new Error(`'${args['gp-name']}' 은(는) 연동되지 않은 수기 운용사로 이미 있습니다. --gp-name 으로 다른 이름을 주세요`);
    }
    if (!gp) {
      [gp] = await tx`
        insert into gps (org_id, name, gp_type, gp_connection_id, memo)
        values (${org.id}, ${args['gp-name']}, 'venture_capital', ${connection.id}, 'GP 시스템 연동 (gp:link 로 등록)')
        returning id, gp_connection_id
      `;
      console.log(`• 운용사 '${args['gp-name']}' 등록`);
    } else console.log(`• 운용사 '${args['gp-name']}': 이미 있음`);

    // ④ 기관 연결
    const [link] = await tx`select gp_lp_id, gp_id from gp_lp_links where org_id = ${org.id} and gp_connection_id = ${connection.id}`;
    if (link && link.gp_lp_id !== gpLpId) {
      throw new Error(`이 기관은 이미 다른 GP 출자자(${link.gp_lp_id.slice(0, 8)}…)에 연결되어 있습니다`);
    }
    if (!link) {
      const [taken] = await tx`select o.name from gp_lp_links l join orgs o on o.id = l.org_id where l.gp_connection_id = ${connection.id} and l.gp_lp_id = ${gpLpId}`;
      if (taken) throw new Error(`이 GP 출자자는 이미 다른 기관('${taken.name}')에 연결되어 있습니다`);
      await tx`insert into gp_lp_links (org_id, gp_connection_id, gp_lp_id, gp_id) values (${org.id}, ${connection.id}, ${gpLpId}, ${gp.id})`;
      console.log(`• 기관 연결: '${org.name}' = GP 출자자 '${gpLp.name}'`);
    } else console.log(`• 기관 연결: 이미 있음`);
  });

  console.log(`\n✔ 연결 확인됨: '${org.name}' → GP 출자자 '${gpLp.name}'`);
  console.log(`  GP 쪽 웹훅 주소(LP_SYSTEM_WEBHOOK_URL): <LP 주소>/api/webhooks/gp/${connection.id}`);
} catch (err) {
  await fail(err.message);
}
await sql.end();
