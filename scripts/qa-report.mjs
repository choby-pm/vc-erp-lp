// QA 결과지 만들기 (docs/96_qa_scenarios.md + .qa-result.json + scripts/qa-catalog.mjs → docs/qa-reports/<날짜>.md · .xlsx · .csv · .json)
//
//   npm run qa:e2e -- --reset   먼저 QA를 돌린다 (.qa-result.json 이 생긴다)
//   npm run qa:report           결과지를 만든다 — MD(저장소용) · XLSX(엑셀 · 구글 시트) · CSV(UTF-8 BOM) · JSON
//
// 항목마다 서비스 › 1뎁스 메뉴 › 2뎁스 화면 › 3뎁스 기능 · 연동(qa-catalog.mjs)과
// 시나리오의 확인 · 기대 결과, 실행의 통과 · 실제 값을 ID로 맞춘다
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { writeXlsx } from './qa-report-xlsx.mjs';
import { catalogOf, MENU_ORDER, screenRank } from './qa-catalog.mjs';

const result = JSON.parse(fs.readFileSync(new URL('../.qa-result.json', import.meta.url), 'utf8'));
const doc = fs.readFileSync(new URL('../docs/96_qa_scenarios.md', import.meta.url), 'utf8');

// 시나리오 문서: "## n. 단계" 아래 표 행 "| ID | 확인 | 기대 결과 | 결과 |"
const scenarios = new Map();
let stage = '';
for (const line of doc.split(/\r?\n/)) {
  const h = line.match(/^## (\d+)\. (.+)$/);
  if (h) stage = `${h[1]}. ${h[2].replace(/🔗/g, '').replace(/\s+/g, ' ').trim()}`;
  const row = line.match(/^\| (Q\d+-\d+)([^|]*)\| ([^|]*) \| ([^|]*) \|/);
  if (row) scenarios.set(row[1], { stage, marks: row[2].trim(), check: row[3].trim(), expected: row[4].trim() });
}

const short = (cmd, cwd) => { try { return execSync(cmd, { cwd, encoding: 'utf8' }).trim(); } catch { return '-'; } };
// QA를 돌린 때의 버전 (예전 결과에는 없어서 지금 버전으로 대신한다)
const lpCommit = result.lp ?? short('git rev-parse --short HEAD');
const gpCommit = result.gp ?? short('git rev-parse --short HEAD', new URL('../../gp/', import.meta.url));
const at = new Date(result.at);
const kst = (d) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const date = kst(at).slice(0, 10);

const plain = (v) => String(v).replace(/\*\*/g, '').replace(/`/g, '');
const flowRows = result.results.map((r) => {
  const id = r.id.split(' ')[0];
  const s = scenarios.get(id) ?? { stage: '-', marks: '', check: r.label, expected: '-' };
  const kind = [s.marks.includes('🔗') || r.id.includes('🔗') ? '연동' : '', s.marks.includes('⛔') || r.id.includes('⛔') ? '차단' : ''].filter(Boolean).join(' · ') || '기능';
  return { id, ...catalogOf(id), stage: s.stage, kind, check: plain(s.check), expected: plain(s.expected), ok: r.ok, actual: r.detail };
});
// 결과지 순서: 서비스(공통 → LP → GP) → 메뉴(사이드바 순서) → 화면(탭 순서) → 업무 순서
const SERVICE_ORDER = ['공통', 'LP', 'GP'];
const menuRank = (r) => (MENU_ORDER[r.service] ?? []).indexOf(r.menu);
const rows = [...flowRows].sort(
  (a, b) => SERVICE_ORDER.indexOf(a.service) - SERVICE_ORDER.indexOf(b.service) || menuRank(a) - menuRank(b) || screenRank(a.screen) - screenRank(b.screen) || a.screen.localeCompare(b.screen, 'ko') || flowRows.indexOf(a) - flowRows.indexOf(b),
);

const passed = rows.filter((r) => r.ok).length;
const failed = rows.length - passed;
const has = (k) => (r) => r.kind.includes(k);
const tally = (g) => `${g.filter((r) => r.ok).length} / ${g.length}`;
const groupsOf = (list, key) => [...new Set(list.map(key))].map((k) => list.filter((r) => key(r) === k));

const md = [];
md.push(`# QA 결과지 — ${date}`, '');
md.push('> GP · LP 업무 흐름 QA ([96 시나리오](../96_qa_scenarios.md))를 배포 사이트에 실제로 요청해 확인한 결과. 항목은 **서비스 › 1뎁스 메뉴 › 2뎁스 화면 › 3뎁스 기능** 으로 나눴다. `npm run qa:e2e -- --reset` → `npm run qa:report` 로 만든다', '');
md.push('## 요약', '');
md.push('| 항목 | 값 |', '|---|---|');
md.push(`| 결과 | **${failed === 0 ? '전체 통과' : `실패 ${failed}건`}** — ${passed} / ${rows.length} |`);
for (const svc of SERVICE_ORDER) {
  const g = rows.filter((r) => r.service === svc);
  if (g.length) md.push(`| ${svc} | ${tally(g)} (메뉴 ${new Set(g.map((r) => r.menu)).size}개) |`);
}
md.push(`| 연동 확인 (GP ↔ LP) | ${tally(rows.filter(has('연동')))} |`);
md.push(`| 차단 확인 (막아야 할 것) | ${tally(rows.filter(has('차단')))} |`);
md.push(`| 실행 시각 (KST) | ${kst(at)} |`);
md.push('| 환경 | 배포 LP https://vc-erp-lp.vercel.app ↔ 배포 GP https://vc-erp-gp.vercel.app (데모 DB) |');
md.push(`| 코드 버전 | LP \`${lpCommit}\` · GP \`${gpCommit}\` |`);
md.push('| 데이터 | 데모 시드 시작 상태에서 실행 → 끝난 뒤 짝 맞춘 데모 갱신으로 되돌림 |', '');
if (failed) {
  md.push('## 실패 항목', '');
  for (const r of rows.filter((x) => !x.ok)) md.push(`- **${r.id}** ${r.service} › ${r.menu} › ${r.screen} › ${r.feature} — 기대: ${r.expected} / 실제: ${r.actual}`);
  md.push('');
}

md.push('## 서비스 · 메뉴별', '');
md.push('| 서비스 | 1뎁스 메뉴 | 2뎁스 화면 | 항목 | 통과 | 연동 | 차단 |', '|---|---|---|---|---|---|---|');
for (const g of groupsOf(rows, (r) => `${r.service}\u0000${r.menu}`)) {
  md.push(`| ${g[0].service} | ${g[0].menu} | ${[...new Set(g.map((r) => r.screen))].join(' · ')} | ${g.length} | ${tally(g)} | ${g.filter(has('연동')).length} | ${g.filter(has('차단')).length} |`);
}

const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
md.push('', '## 항목별 결과', '');
for (const svcGroup of groupsOf(rows, (r) => r.service)) {
  md.push(`### ${svcGroup[0].service}`, '');
  md.push('| ID | 1뎁스 메뉴 | 2뎁스 화면 | 3뎁스 기능 | 구분 | 연동 (방향 · 상대 화면) | 기대 결과 | 결과 | 실제 값 |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of svcGroup) {
    md.push(`| ${r.id} | ${r.menu} | ${cell(r.screen)} | ${cell(r.feature)} | ${r.kind} | ${cell(r.link || '-')} | ${cell(r.expected)} | ${r.ok ? '✅ 통과' : '❌ 실패'} | ${cell(r.actual).slice(0, 100)} |`);
  }
  md.push('');
}

md.push('## 업무 단계별 (참고)', '');
md.push('| 단계 | 통과 | 연동 | 차단 |', '|---|---|---|---|');
for (const g of groupsOf(flowRows, (r) => r.stage)) md.push(`| ${g[0].stage} | ${tally(g)} | ${g.filter(has('연동')).length} | ${g.filter(has('차단')).length} |`);

md.push('', '## 읽는 법', '');
md.push('- **서비스 · 메뉴 · 화면**: 결과를 확인하는 화면 기준. 메뉴 이름은 실제 사이드바와 같다');
md.push('  - LP: 대시보드 · 결재함 · 납입·분배 · 사후관리 · 출자 심사 · 포트폴리오 · 조합·운용사 · 기관 설정 (+ 화면 없이 GP가 부르는 "연동 API")');
md.push('  - GP: 대시보드 · 조합(개요 · 출자자·조합원 · 투자·회수 · 재무·회계 · 총회·보고 탭) · 출자사업 공고 · 딜·기업 · 출자자 · 구성원 · LP 연동');
md.push('- **연동 (방향 · 상대 화면)**: 다른 시스템에서 시작한 일이면 방향과 그 시스템 화면. 예: "GP → LP · GP 캐피탈콜 발송"');
md.push('- **구분**: 연동 = GP ↔ LP 사이에 도착하는지 · 차단 = 막혀야 할 것을 막는지(권한 · 기관 분리 · 업무 규칙 · 서명 위조) · 기능 = 한 시스템 안의 흐름');
md.push('- 업무 순서로 보려면 [96 시나리오](../96_qa_scenarios.md) 또는 엑셀 "업무 단계" 열로 정렬', '');

const dir = new URL('../docs/qa-reports/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(new URL(`${date}.md`, dir), md.join('\n'));

const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;
const HEAD = ['ID', '서비스', '1뎁스 메뉴', '2뎁스 화면', '3뎁스 기능', '구분', '연동', '업무 단계', '확인 내용', '기대 결과', '결과', '실제 값', '실행 시각(KST)', 'LP 버전', 'GP 버전'];
const csv = [HEAD.map(csvCell).join(',')];
for (const r of rows) csv.push([r.id, r.service, r.menu, r.screen, r.feature, r.kind, r.link, r.stage, r.check, r.expected, r.ok ? '통과' : '실패', r.actual, kst(at), lpCommit, gpCommit].map(csvCell).join(','));
fs.writeFileSync(new URL(`${date}.csv`, dir), '﻿' + csv.join('\r\n'));
fs.writeFileSync(new URL(`${date}.json`, dir), JSON.stringify({ date, at: result.at, lp: lpCommit, gp: gpCommit, passed, total: rows.length, rows }, null, 2));

await writeXlsx(new URL(`${date}.json`, dir), new URL(`${date}.xlsx`, dir));
console.log(`${failed === 0 ? '✔' : '✖'} ${passed}/${rows.length} → docs/qa-reports/${date}.md · .xlsx · .csv · .json`);
