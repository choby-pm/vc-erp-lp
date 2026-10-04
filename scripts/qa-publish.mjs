// QA 자동 실행 결과지를 qa-reports 브랜치 작업 폴더에 날짜별로 모은다 (.github/workflows/qa.yml 이 부른다)
//
//   node scripts/qa-publish.mjs <작업 폴더>
//
// <작업 폴더>/<날짜>/ 에 LP · 연동(<날짜>.*), GP 단독(<날짜>-gp.*), 혼합(<날짜>-mixed.*) 결과지를 복사하고
// <작업 폴더>/README.md 에 날짜별 결과 목록을 새로 쓴다 (최신이 위)
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('작업 폴더를 넘기세요');
const lpDir = new URL('../docs/qa-reports/', import.meta.url);
const gpDir = new URL('../../gp/docs/qa-reports/', import.meta.url);
// 결과지 날짜 = LP · 연동 QA 실행일(KST). 세 결과지가 같은 날 만들어진다
const lpAt = JSON.parse(fs.readFileSync(new URL('../.qa-result.json', import.meta.url), 'utf8')).at;
const date = new Date(lpAt).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);

const dest = path.join(out, date);
fs.mkdirSync(dest, { recursive: true });
for (const ext of ['md', 'xlsx', 'csv', 'json']) {
  fs.copyFileSync(new URL(`${date}.${ext}`, lpDir), path.join(dest, `${date}.${ext}`));
  fs.copyFileSync(new URL(`${date}.${ext}`, gpDir), path.join(dest, `${date}-gp.${ext}`));
  fs.copyFileSync(new URL(`${date}-mixed.${ext}`, lpDir), path.join(dest, `${date}-mixed.${ext}`));
}

// 날짜별 목록: 각 폴더의 혼합 결과(json)에서 다시 만든다
const runs = fs.readdirSync(out).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().map((d) => {
  const j = JSON.parse(fs.readFileSync(path.join(out, d, `${d}-mixed.json`), 'utf8'));
  const svc = (s) => { const g = j.rows.filter((r) => r.service === s); return `${g.filter((r) => r.ok).length}/${g.length}`; };
  const fails = j.rows.filter((r) => !r.ok).map((r) => r.id);
  return `| ${d} | ${j.passed === j.total ? '✅' : '❌'} **${j.passed}/${j.total}** | GP ${svc('GP')} · LP ${svc('LP')} | ${fails.join(', ') || '-'} | [혼합](${d}/${d}-mixed.md) · [LP·연동](${d}/${d}.md) · [GP 단독](${d}/${d}-gp.md) | LP \`${j.lp ?? '-'}\` · GP \`${j.gp ?? '-'}\` |`;
});
fs.writeFileSync(path.join(out, 'README.md'), [
  '# QA 자동 실행 결과지',
  '',
  '> 매일 01:00(KST) GitHub Actions가 배포 GP · LP 데모에서 QA를 돌리고 여기에 쌓는다 (main 브랜치 `.github/workflows/qa.yml`).',
  '> 날짜 폴더마다 혼합(생애주기 순서) · LP·연동 · GP 단독 결과지가 MD · 엑셀 · CSV · JSON으로 있다. 실패하면 Actions 실행이 실패로 표시되고 메일이 온다',
  '',
  '| 날짜 | 결과 | 서비스별 | 실패 항목 | 결과지 | 코드 버전 |',
  '|---|---|---|---|---|---|',
  ...runs,
  '',
].join('\n'));
console.log(`✔ ${date} 결과지 → ${dest}`);
