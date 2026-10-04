// QA 결과지 만들기 (docs/96_qa_scenarios.md + .qa-result.json → docs/qa-reports/<날짜>.md · .csv)
//
//   npm run qa:e2e -- --reset   먼저 QA를 돌린다 (.qa-result.json 이 생긴다)
//   npm run qa:report           결과지를 만든다 — MD(저장소용) · CSV(구글 시트 · 엑셀로 가져오기용, UTF-8 BOM)
//
// 시나리오 문서의 "확인 · 기대 결과"와 실행 결과의 "통과 · 실제 값"을 ID로 맞춰 한 표로 만든다
import fs from 'node:fs';
import { execSync } from 'node:child_process';

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
const lpCommit = short('git rev-parse --short HEAD');
const gpCommit = short('git rev-parse --short HEAD', new URL('../../gp/', import.meta.url));
const at = new Date(result.at);
const kst = (d) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const date = kst(at).slice(0, 10);

const rows = result.results.map((r) => {
  const id = r.id.split(' ')[0];
  const s = scenarios.get(id) ?? { stage: '-', marks: '', check: r.label, expected: '-' };
  const kind = [s.marks.includes('🔗') || r.id.includes('🔗') ? '연동' : '', s.marks.includes('⛔') || r.id.includes('⛔') ? '차단' : ''].filter(Boolean).join(' · ') || '기능';
  return { id, stage: s.stage, kind, check: s.check, expected: s.expected, ok: r.ok, actual: r.detail };
});
const passed = rows.filter((r) => r.ok).length;
const failed = rows.length - passed;
const integ = rows.filter((r) => r.kind.includes('연동'));
const blocks = rows.filter((r) => r.kind.includes('차단'));

const md = [];
md.push(`# QA 결과지 — ${date}`, '');
md.push('> GP · LP 업무 흐름 순서 QA ([96 시나리오](../96_qa_scenarios.md))를 배포 사이트에 실제로 요청해 확인한 결과. `npm run qa:e2e -- --reset` → `npm run qa:report` 로 만든다', '');
md.push('## 요약', '');
md.push('| 항목 | 값 |', '|---|---|');
md.push(`| 결과 | **${failed === 0 ? '전체 통과' : `실패 ${failed}건`}** — ${passed} / ${rows.length} |`);
md.push(`| 연동 확인 (🔗) | ${integ.filter((r) => r.ok).length} / ${integ.length} |`);
md.push(`| 차단 확인 (⛔) | ${blocks.filter((r) => r.ok).length} / ${blocks.length} |`);
md.push(`| 실행 시각 (KST) | ${kst(at)} |`);
md.push('| 환경 | 배포 LP https://vc-erp-lp.vercel.app ↔ 배포 GP https://vc-erp-gp.vercel.app (데모 DB) |');
md.push(`| 코드 버전 | LP \`${lpCommit}\` · GP \`${gpCommit}\` |`);
md.push('| 데이터 | 데모 시드 시작 상태에서 실행 → 끝난 뒤 짝 맞춘 데모 갱신으로 되돌림 |', '');
if (failed) {
  md.push('## 실패 항목', '');
  for (const r of rows.filter((x) => !x.ok)) md.push(`- **${r.id}** ${r.check} — 기대: ${r.expected} / 실제: ${r.actual}`);
  md.push('');
}
md.push('## 단계별', '');
md.push('| 단계 | 통과 | 연동 | 차단 |', '|---|---|---|---|');
for (const st of [...new Set(rows.map((r) => r.stage))]) {
  const g = rows.filter((r) => r.stage === st);
  md.push(`| ${st} | ${g.filter((r) => r.ok).length} / ${g.length} | ${g.filter((r) => r.kind.includes('연동')).length} | ${g.filter((r) => r.kind.includes('차단')).length} |`);
}
md.push('', '## 항목별 결과', '');
md.push('| ID | 구분 | 확인 | 기대 결과 | 결과 | 실제 값 |', '|---|---|---|---|---|---|');
const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
for (const r of rows) md.push(`| ${r.id} | ${r.kind} | ${cell(r.check)} | ${cell(r.expected)} | ${r.ok ? '✅ 통과' : '❌ 실패'} | ${cell(r.actual).slice(0, 120)} |`);
md.push('', '## 구분', '', '- **연동**: GP에서 한 일이 LP에 도착하는지, 또는 LP에서 한 일이 GP에 도착하는지 (웹훅 · 응답 API · 공고 지원 API)', '- **차단**: 막혀야 할 것을 시스템이 막는지 (권한 · 기관 분리 · 업무 규칙 · 서명 위조)', '- **기능**: 한 시스템 안의 업무 흐름', '');

const dir = new URL('../docs/qa-reports/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(new URL(`${date}.md`, dir), md.join('\n'));

const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csv = [['ID', '단계', '구분', '확인', '기대 결과', '결과', '실제 값', '실행 시각(KST)', 'LP 버전', 'GP 버전'].map(csvCell).join(',')];
for (const r of rows) csv.push([r.id, r.stage, r.kind, r.check, r.expected, r.ok ? '통과' : '실패', r.actual, kst(at), lpCommit, gpCommit].map(csvCell).join(','));
fs.writeFileSync(new URL(`${date}.csv`, dir), '﻿' + csv.join('\r\n'));
fs.writeFileSync(new URL(`${date}.json`, dir), JSON.stringify({ date, at: result.at, lp: lpCommit, gp: gpCommit, passed, total: rows.length, rows }, null, 2));

console.log(`${failed === 0 ? '✔' : '✖'} ${passed}/${rows.length} → docs/qa-reports/${date}.md · .csv · .json`);
