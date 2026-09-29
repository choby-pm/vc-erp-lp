// DB 마이그레이션 실행 스크립트
//
// db/migrations 폴더의 .sql 파일을 이름 순서대로 실행한다.
// 이미 실행한 파일은 schema_migrations 테이블에 기록해 두고 다시 실행하지 않는다.
// 파일 하나는 하나의 트랜잭션으로 실행되어, 중간에 실패하면 그 파일의 변경은 전부 취소된다.
//
// 사용법
//   npm run db:migrate          아직 실행하지 않은 파일을 모두 실행
//   npm run db:migrate status   실행 여부만 확인 (DB를 바꾸지 않음)

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

// 테이블 생성 같은 구조 변경은 커넥션 풀러를 거치지 않는 직접 연결 주소를 쓴다.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_UNPOOLED 또는 DATABASE_URL 이 .env.local 에 없습니다.');
  process.exit(1);
}

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
const statusOnly = process.argv[2] === 'status';
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`
    create table if not exists schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = new Set((await sql`select version from schema_migrations`).map((r) => r.version));
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  for (const f of files) console.log(`${applied.has(f) ? '✅ 실행됨' : '⏳ 대기  '}  ${f}`);

  if (statusOnly || pending.length === 0) {
    if (pending.length === 0) console.log('\n실행할 마이그레이션이 없습니다.');
  } else {
    for (const f of pending) {
      const body = await readFile(path.join(migrationsDir, f), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (version) values (${f})`;
      });
      console.log(`\n✔ ${f} 실행 완료`);
    }
  }
} catch (err) {
  console.error('\n✖ 마이그레이션 실패 — 이 파일의 변경은 모두 취소되었습니다.');
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
