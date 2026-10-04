// LP · GP 혼합 QA 결과지 — 조합 생애주기 순서 (docs/qa-reports/<날짜>-mixed.md · .xlsx · .csv · .json)
//
//   (LP) npm run qa:e2e -- --reset       GP ↔ LP 연동 · LP 업무 QA → .qa-result.json
//   (GP) npm run qa:gp -- --reset        GP 단독 QA → ../gp/.qa-result.json
//   (LP) npm run qa:mixed-report         두 결과를 생애주기 11단계로 합친다
//
// 단계 안에서는 GP가 먼저 한 일 → LP에서 확인하는 일 순서. 각 행은 서비스 › 1뎁스 메뉴 › 2뎁스 화면 › 3뎁스 기능
// GP 항목 원본은 옆 저장소 ../gp/scripts/qa-gp-catalog.mjs (vc-erp 작업 폴더에 GP · LP가 나란히 있어야 한다)
import fs from 'node:fs';
import { catalogOf } from './qa-catalog.mjs';
import { writeXlsx } from './qa-report-xlsx.mjs';

const { gpCatalogOf, GP_QA } = await import(new URL('../../gp/scripts/qa-gp-catalog.mjs', import.meta.url));

export const FLOW = {
  F1: '1. 출자 계획 · 공고',
  F2: '2. 조합 기획',
  F3: '3. 모집 · 심사 · 선정',
  F4: '4. 결성',
  F5: '5. 납입 · 투자 운용',
  F6: '6. 보고 · 총회 · 통지',
  F7: '7. 재무 · 회계',
  F8: '8. 회수 · 분배',
  F9: '9. 성과 분석',
  F10: '10. 해산 · 청산',
  F11: '11. 공통 (권한 · 보안 · 화면)',
};
// LP 시나리오(docs/96)의 단계 → 생애주기 단계
const LP_FLOW = { 0: 'F11', 1: 'F1', 2: 'F3', 3: 'F3', 4: 'F4', 5: 'F5', 6: 'F6', 7: 'F8', 8: 'F9', 9: 'F10', 10: 'F11' };

const lpResult = JSON.parse(fs.readFileSync(new URL('../.qa-result.json', import.meta.url), 'utf8'));
const gpResult = JSON.parse(fs.readFileSync(new URL('../../gp/.qa-result.json', import.meta.url), 'utf8'));
const doc = fs.readFileSync(new URL('../docs/96_qa_scenarios.md', import.meta.url), 'utf8');
const lpExpected = new Map();
for (const line of doc.split(/\r?\n/)) {
  const row = line.match(/^\| (Q\d+-\d+)([^|]*)\| ([^|]*) \| ([^|]*) \|/);
  if (row) lpExpected.set(row[1], { marks: row[2], check: row[3].trim(), expected: row[4].trim() });
}
const plain = (v) => String(v).replace(/\*\*/g, '').replace(/`/g, '');

const lpRows = lpResult.results.map((r) => {
  const id = r.id.split(' ')[0];
  const s = lpExpected.get(id) ?? { marks: '', check: r.label, expected: '-' };
  const kind = [s.marks.includes('🔗') || r.id.includes('🔗') ? '연동' : '', s.marks.includes('⛔') || r.id.includes('⛔') ? '차단' : ''].filter(Boolean).join(' · ') || '기능';
  const flow = LP_FLOW[Number(id.slice(1).split('-')[0])];
  return { id, ...catalogOf(id), kind, flow, stage: FLOW[flow], check: plain(s.check), expected: plain(s.expected), ok: r.ok, actual: r.detail, source: 'LP · 연동 QA' };
});
const gpRows = GP_QA.map(([id]) => {
  const c = gpCatalogOf(id);
  const r = gpResult.results.find((x) => x.id === id);
  return { ...c, link: '', stage: FLOW[c.flow], check: c.feature, ok: Boolean(r?.ok), actual: r ? r.detail : '실행 안 됨', source: 'GP 단독 QA' };
});
const order = Object.keys(FLOW);
// 단계 안에서는 GP 단독 → LP · 연동 (GP가 먼저 하고 LP가 받는 흐름), 각 목록의 원래 순서 유지
const rows = [...gpRows, ...lpRows].sort((a, b) => order.indexOf(a.flow) - order.indexOf(b.flow) || (a.source === b.source ? 0 : a.source === 'GP 단독 QA' ? -1 : 1));

const kst = (d) => new Date(d).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const date = kst(new Date(Math.max(Date.parse(lpResult.at), Date.parse(gpResult.at)))).slice(0, 10);
const passed = rows.filter((r) => r.ok).length;
const failed = rows.length - passed;
const tally = (g) => `${g.filter((r) => r.ok).length} / ${g.length}`;
const by = (svc) => rows.filter((r) => r.service === svc);
const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');

const md = [`# LP · GP 혼합 QA 결과지 — ${date}`, ''];
md.push('> GP(운용사) 단독 QA와 LP(출자기관) · GP ↔ LP 연동 QA를 **조합 생애주기 순서**로 합친 결과지. 단계 안에서는 GP가 먼저 한 일 → LP에서 확인하는 일 순서이고, 각 행은 **서비스 › 1뎁스 메뉴 › 2뎁스 화면 › 3뎁스 기능**. `npm run qa:mixed-report` 로 만든다', '');
md.push('## 요약', '', '| 항목 | 값 |', '|---|---|');
md.push(`| 결과 | **${failed === 0 ? '전체 통과' : `실패 ${failed}건`}** — ${passed} / ${rows.length} |`);
md.push(`| 서비스별 | GP ${tally(by('GP'))} · LP ${tally(by('LP'))} · 공통 ${tally(by('공통'))} |`);
md.push(`| 연동 확인 (GP ↔ LP) | ${tally(rows.filter((r) => r.kind.includes('연동')))} |`);
md.push(`| 차단 확인 (막아야 할 것) | ${tally(rows.filter((r) => r.kind.includes('차단')))} |`);
md.push(`| 실행 | LP · 연동 QA ${kst(lpResult.at)} (LP \`${lpResult.lp ?? '-'}\` · GP \`${lpResult.gp ?? '-'}\`, ${lpRows.length}개) · GP 단독 QA ${kst(gpResult.at)} (GP \`${gpResult.gp ?? '-'}\`, ${gpRows.length}개) |`);
md.push('| 환경 | 배포 LP https://vc-erp-lp.vercel.app ↔ 배포 GP https://vc-erp-gp.vercel.app (데모 DB). 두 QA 모두 데모 시작 상태에서 따로 실행하고 끝난 뒤 되돌림 |');
md.push('| 결과지 | [LP · 연동](' + `${lpResult.at ? kst(lpResult.at).slice(0, 10) : date}.md) · GP 단독은 GP 저장소 docs/qa-reports |`, '');
if (failed) {
  md.push('## 실패 항목', '');
  for (const r of rows.filter((x) => !x.ok)) md.push(`- **${r.id}** ${r.service} › ${r.menu} › ${r.screen} › ${r.feature} — 기대: ${r.expected} / 실제: ${r.actual}`);
  md.push('');
}
md.push('## 생애주기 단계별', '', '| 단계 | GP | LP | 공통 | 연동 | 차단 | 통과 |', '|---|---|---|---|---|---|---|');
for (const f of order) {
  const g = rows.filter((r) => r.flow === f);
  if (!g.length) continue;
  const n = (svc) => g.filter((r) => r.service === svc).length || '-';
  md.push(`| ${FLOW[f]} | ${n('GP')} | ${n('LP')} | ${n('공통')} | ${g.filter((r) => r.kind.includes('연동')).length} | ${g.filter((r) => r.kind.includes('차단')).length} | ${tally(g)} |`);
}
md.push('', '## 단계별 항목', '');
for (const f of order) {
  const g = rows.filter((r) => r.flow === f);
  if (!g.length) continue;
  md.push(`### ${FLOW[f]} — ${tally(g)}`, '', '| ID | 서비스 | 1뎁스 메뉴 | 2뎁스 화면 | 3뎁스 기능 | 구분 | 연동 (방향 · 상대 화면) | 기대 결과 | 결과 |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of g) md.push(`| ${r.id} | ${r.service} | ${r.menu} | ${cell(r.screen)} | ${cell(r.feature)} | ${r.kind} | ${cell(r.link || '-')} | ${cell(r.expected)} | ${r.ok ? '✅ 통과' : '❌ 실패'} |`);
  md.push('');
}
md.push('## 읽는 법', '');
md.push('- **ID**: `G` = GP 단독 QA (GP 저장소 docs/96), `Q` = LP · 연동 QA (LP 저장소 docs/96). 실제 값은 엑셀 · 각 결과지에 있다');
md.push('- **서비스 · 메뉴 · 화면**: 결과를 확인하는 화면 기준, 메뉴 이름은 실제 사이드바. GP 조합 화면은 "큰 탭 › 작은 탭"');
md.push('- **연동**: 다른 시스템에서 시작한 일이면 방향과 그 시스템 화면. 구분 연동 = GP ↔ LP 사이에 도착하는지 · 차단 = 막혀야 할 것을 막는지', '');

const dir = new URL('../docs/qa-reports/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(new URL(`${date}-mixed.md`, dir), md.join('\n'));
const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csv = [['생애주기 단계', 'ID', '서비스', '1뎁스 메뉴', '2뎁스 화면', '3뎁스 기능', '구분', '연동', '기대 결과', '결과', '실제 값', '출처'].map(csvCell).join(',')];
for (const r of rows) csv.push([r.stage, r.id, r.service, r.menu, r.screen, r.feature, r.kind, r.link, r.expected, r.ok ? '통과' : '실패', r.actual, r.source].map(csvCell).join(','));
fs.writeFileSync(new URL(`${date}-mixed.csv`, dir), '﻿' + csv.join('\r\n'));
const json = { date: `${date} (LP·GP 혼합)`, at: gpResult.at, lp: lpResult.lp, gp: gpResult.gp, passed, total: rows.length, rows };
fs.writeFileSync(new URL(`${date}-mixed.json`, dir), JSON.stringify(json, null, 2));
await writeXlsx(new URL(`${date}-mixed.json`, dir), new URL(`${date}-mixed.xlsx`, dir), { byStage: true });
// ── 소개 페이지(public/intro/index.html) QA 숫자 · 구역을 이번 결과로 고친다 (표시 사이만)
// 소개 페이지에서 여는 공개 결과지 (구글 시트, 링크가 있는 모든 사용자 보기). 시트는 손으로 올린 시점의 결과다
const QA_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1NiP9qj8-wphCHt97Z3jp7IBlKKscRGvuvKHKnflezBw/edit?usp=sharing';
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const lpNumbers = lpResult.results.find((r) => r.id.startsWith('Q8-2'))?.detail.match(/(\d+)\s*개/)?.[1];
const stageRows = order.map((f) => {
  const g = rows.filter((r) => r.flow === f);
  if (!g.length) return '';
  const n = (svc) => g.filter((r) => r.service === svc).length;
  const bar = [['g', n('GP')], ['l', n('LP')], ['c', n('공통')]].filter(([, k]) => k).map(([c, k]) => `<i class="${c}" style="flex: ${k}"></i>`).join('');
  const ok = g.every((r) => r.ok);
  return `          <tr><td>${esc(FLOW[f])}</td><td><div class="mix" role="img" aria-label="GP ${n('GP')} · LP ${n('LP')}${n('공통') ? ` · 공통 ${n('공통')}` : ''}">${bar}</div></td><td class="n">${g.length}</td><td class="n">${g.filter((r) => r.kind.includes('연동')).length}</td><td class="n">${g.filter((r) => r.kind.includes('차단')).length}</td><td class="ok ${ok ? 'pass' : 'fail'}">${ok ? '✓' : '✕'} ${tally(g).replace(/ /g, '')}</td></tr>`;
}).filter(Boolean).join('\n');
const section = `<section class="block" aria-labelledby="qa-h">
    <header>
      <p class="eyebrow">검증</p>
      <h2 id="qa-h">조합 생애주기 순서로 돌린 QA</h2>
      <p>배포된 두 사이트에 실제로 요청을 보내, GP가 조합을 기획해 청산할 때까지의 일과 LP가 그것을 받아 심사 · 결재 · 대사하는 일을 단계마다 확인합니다. 막혀야 할 요청이 막히는지도 함께 봅니다. 매일 01:00(KST)에 자동으로 돌고, 끝나면 데모를 처음 상태로 되돌립니다.</p>
    </header>
    <div class="facts">
      <div class="fact"><b class="num">${passed}/${rows.length}</b><span>${kst(gpResult.at).slice(0, 10)} 실행 결과</span></div>
      <div class="fact"><b class="num">${gpRows.length} · ${lpRows.length}</b><span>GP 단독 · LP와 연동</span></div>
      <div class="fact"><b class="num">${rows.filter((r) => r.kind.includes('연동')).length}</b><span>GP ↔ LP 사이에 도착하는지</span></div>
      <div class="fact"><b class="num">${rows.filter((r) => r.kind.includes('차단')).length}</b><span>막혀야 할 것을 막는지</span></div>
    </div>
    <div class="qa">
      <table>
        <thead><tr><th>생애주기 단계</th><th>항목 구성</th><th>항목</th><th>연동</th><th>차단</th><th>결과</th></tr></thead>
        <tbody>
${stageRows}
        </tbody>
      </table>
    </div>
    <p class="qa-key"><span style="--k: var(--gp)">GP 화면에서 확인</span><span style="--k: var(--lp)">LP 화면에서 확인</span><span style="--k: var(--muted)">공통</span><span class="note">항목마다 서비스 › 메뉴 › 화면 › 기능으로 정리한 <a href="${QA_SHEET_URL}" target="_blank" rel="noopener">QA 결과지</a></span></p>
  </section>`;
const fact = `<div class="fact"><b class="num">${passed}/${rows.length}</b><span>생애주기 QA (GP ${gpRows.length} · LP·연동 ${lpRows.length})${lpNumbers ? ` · 숫자 일치 ${lpNumbers}개` : ''}, 배포에서 통과</span></div>`;
const introUrl = new URL('../public/intro/index.html', import.meta.url);
let intro = fs.readFileSync(introUrl, 'utf8');
const put = (tag, html) => { intro = intro.replace(new RegExp(`(<!-- ${tag} [^>]*-->)[\\s\\S]*?(<!-- /${tag} -->)`), (_, a, b) => `${a}${html}${b}`); };
if (failed === 0) {
  put('QA-FACT', fact);
  put('QA-SECTION', section);
  fs.writeFileSync(introUrl, intro);
}

console.log(`${failed === 0 ? '✔' : '✖'} ${passed}/${rows.length} (GP ${gpRows.length} + LP·연동 ${lpRows.length}) → docs/qa-reports/${date}-mixed.md · .xlsx · .csv · .json`);
