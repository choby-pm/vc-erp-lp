// 데모 기관·계정 생성 스크립트
//
// 기관 2곳 × 역할 3개(출자 담당·결재권자·관리자) 계정을 만든다. 이미 있으면 이름·역할·비밀번호를 새로 맞춘다.
// 데모 버튼은 비밀번호 없이 로그인하므로, 비밀번호는 일반 로그인을 시험할 때만 쓴다.
// 비밀번호는 git에 올라가지 않는 demo-accounts.md 에 적는다 (.gitignore).
//
// 기관 ID·이메일 규칙은 lib/auth/demo.ts 와 같아야 한다.
//
// 사용법: npm run db:seed

import { randomBytes, scrypt } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import postgres from 'postgres';

const ORGS = [
  { key: 'a', id: '0a000000-0000-4000-8000-00000000000a', name: '하늘연금 (데모)', org_type: 'pension',
    users: { officer: '이지원', approver: '박도현', admin: '최서윤' } },
  { key: 'b', id: '0b000000-0000-4000-8000-00000000000b', name: '바다성장출자 (데모)', org_type: 'policy',
    users: { officer: '정민재', approver: '한수아', admin: '오세진' } },
];
const ROLE_LABEL = { officer: '출자 담당', approver: '결재권자', admin: '관리자' };
const demoEmail = (org, role) => `${role}@${org}.demo.lp-erp.dev`;

// lib/auth/password.ts 와 같은 형식: scrypt$<salt>$<hash>
async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await promisify(scrypt)(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

const sql = postgres(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL, { max: 1 });

try {
  const lines = [];
  await sql.begin(async (tx) => {
    for (const org of ORGS) {
      await tx`
        insert into orgs (id, name, org_type) values (${org.id}, ${org.name}, ${org.org_type})
        on conflict (id) do update set name = excluded.name, org_type = excluded.org_type
      `;
      lines.push(`\n## ${org.name}\n`, '| 역할 | 이름 | 이메일 | 비밀번호 |', '|---|---|---|---|');
      for (const [role, name] of Object.entries(org.users)) {
        const email = demoEmail(org.key, role);
        const password = randomBytes(9).toString('base64url');
        const [existing] = await tx`select org_id from users where email = ${email}`;
        if (existing && existing.org_id !== org.id) {
          throw new Error(`${email} 이 다른 기관에 속해 있습니다. 직접 확인하세요.`);
        }
        await tx`
          insert into users (org_id, email, name, role, password_hash)
          values (${org.id}, ${email}, ${name}, ${role}, ${await hashPassword(password)})
          on conflict (email) do update
            set name = excluded.name, role = excluded.role, password_hash = excluded.password_hash, disabled_at = null
        `;
        lines.push(`| ${ROLE_LABEL[role]} | ${name} | ${email} | \`${password}\` |`);
      }
    }
  });

  await writeFile(
    'demo-accounts.md',
    `# 데모 계정 (LP ERP)\n\n> \`npm run db:seed\` 가 만든 파일입니다. git에 올라가지 않습니다. 다시 실행하면 비밀번호가 바뀝니다.\n> 로그인 화면의 데모 버튼은 비밀번호 없이 들어갑니다.\n${lines.join('\n')}\n`,
  );
  console.log('✔ 데모 기관 2곳, 계정 6개를 준비했습니다');
  console.log('  계정과 비밀번호: demo-accounts.md');
} catch (err) {
  console.error('✖ 데모 계정 생성 실패 — 변경은 모두 취소되었습니다:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
