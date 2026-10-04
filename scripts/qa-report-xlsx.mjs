// QA 결과지 엑셀 (🔗 GP scripts/qa-report-xlsx.mjs 와 같은 코드). <날짜>.json → <날짜>.xlsx. 구글 드라이브에 올리면 구글 시트로 열린다
// 탭: "요약"(결과 · 서비스별 · 환경 · 서비스·메뉴별) · "항목별"(서비스 › 1뎁스 메뉴 › 2뎁스 화면 › 3뎁스 기능, 필터 · 머리글 고정 · 통과/실패 색)
import fs from 'node:fs';
import ExcelJS from 'exceljs';

// opts.byStage: 요약에 "생애주기 단계별" 표를 먼저 둔다 (LP · GP 혼합 결과지). 항목별 탭의 "업무 단계" 열은 rows[].stage
export async function writeXlsx(jsonUrl, xlsxUrl, opts = {}) {
  const r = JSON.parse(fs.readFileSync(jsonUrl, 'utf8'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VC ERP QA';
  wb.created = new Date(r.at);
  const FONT = 'Malgun Gothic';
  const C = {
    ink: 'FF15211F', muted: 'FF5B6B68', head: 'FFE7F6F0', headInk: 'FF065F46', pass: 'FFE7F6F0', passInk: 'FF047857', fail: 'FFFDE8E8', failInk: 'FFB91C1C',
    rule: 'FFDDE5E3', strong: 'FF94A3A0', lp: 'FFE7F6F0', lpInk: 'FF047857', gp: 'FFEEF0FF', gpInk: 'FF4338CA', common: 'FFF1F5F4', warn: 'FFFFF4E5', warnInk: 'FFB45309',
  };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const thin = { style: 'thin', color: { argb: C.rule } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const font = (o = {}) => ({ name: FONT, size: 10, color: { argb: C.ink }, ...o });
  const svcStyle = (svc) => (svc === 'GP' ? [C.gp, C.gpInk] : svc === 'LP' ? [C.lp, C.lpInk] : [C.common, C.muted]);
  const kst = new Date(r.at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
  const rows = r.rows;
  const passed = rows.filter((x) => x.ok).length;
  const tally = (g) => `${g.filter((x) => x.ok).length} / ${g.length}`;
  const groups = (key) => [...new Set(rows.map(key))].map((k) => rows.filter((x) => key(x) === k));

  // ── 요약
  const s = wb.addWorksheet('요약', { views: [{ showGridLines: false }] });
  s.columns = [{ width: 3 }, { width: 12 }, { width: 18 }, { width: 46 }, { width: 8 }, { width: 10 }, { width: 8 }, { width: 8 }];
  s.getCell('B2').value = `QA 결과지 — ${r.date}`;
  s.getCell('B2').font = font({ size: 16, bold: true });
  s.getCell('B3').value = 'GP · LP 업무 흐름 QA — 배포 사이트에 실제로 요청해 확인. 항목은 서비스 › 1뎁스 메뉴 › 2뎁스 화면 › 3뎁스 기능';
  s.getCell('B3').font = font({ color: { argb: C.muted } });
  const info = [
    ['결과', passed === rows.length ? `전체 통과 — ${passed} / ${rows.length}` : `실패 ${rows.length - passed}건 — ${passed} / ${rows.length}`],
    ...['공통', 'LP', 'GP'].filter((v) => rows.some((x) => x.service === v)).map((v) => {
      const g = rows.filter((x) => x.service === v);
      return [`${v}`, `${tally(g)} · 메뉴 ${new Set(g.map((x) => x.menu)).size}개`];
    }),
    ['연동 확인 (GP ↔ LP)', tally(rows.filter((x) => x.kind.includes('연동')))],
    ['차단 확인', tally(rows.filter((x) => x.kind.includes('차단')))],
    ['실행 시각 (KST)', kst],
    ['환경', '배포 LP vc-erp-lp.vercel.app ↔ 배포 GP vc-erp-gp.vercel.app (데모 DB)'],
    ['코드 버전', `LP ${r.lp} · GP ${r.gp}`],
    ['데이터', '데모 시드 시작 상태에서 실행 → 끝난 뒤 짝 맞춘 데모 갱신으로 되돌림'],
  ];
  let y = 5;
  for (const [k, v] of info) {
    s.mergeCells(`B${y}:C${y}`);
    s.mergeCells(`D${y}:H${y}`);
    s.getCell(`B${y}`).value = k;
    s.getCell(`D${y}`).value = v;
    s.getCell(`B${y}`).font = font({ color: { argb: C.muted } });
    s.getCell(`D${y}`).font = font({ size: 11, bold: k === '결과', color: { argb: k === '결과' ? (passed === rows.length ? C.passInk : C.failInk) : C.ink } });
    for (const col of 'BCDEFGH') s.getCell(`${col}${y}`).border = { bottom: thin };
    y++;
  }
  if (opts.byStage) {
    y += 1;
    s.getCell(`B${y}`).value = '생애주기 단계별';
    s.getCell(`B${y}`).font = font({ size: 12, bold: true });
    y++;
    ['단계', '', 'LP · GP', '항목', '통과', '연동', '차단'].forEach((h, i) => {
      const c = s.getCell(y, i + 2);
      c.value = h;
      c.font = font({ bold: true, color: { argb: C.headInk } });
      c.fill = fill(C.head);
      c.border = border;
    });
    y++;
    for (const g of groups((x) => x.stage)) {
      const svc = ['공통', 'LP', 'GP'].map((v) => [v, g.filter((x) => x.service === v).length]).filter(([, n]) => n).map(([v, n]) => `${v} ${n}`).join(' · ');
      s.mergeCells(`B${y}:C${y}`);
      const vals = [g[0].stage, null, svc, g.length, tally(g), g.filter((x) => x.kind.includes('연동')).length, g.filter((x) => x.kind.includes('차단')).length];
      vals.forEach((v, i) => {
        if (i === 1) return;
        const c = s.getCell(y, i + 2);
        c.value = v;
        c.font = font({ bold: i === 0, color: { argb: i === 4 && g.some((x) => !x.ok) ? C.failInk : C.ink } });
        c.border = border;
        c.alignment = { horizontal: i < 3 ? 'left' : 'center' };
      });
      y++;
    }
  }
  y += 1;
  s.getCell(`B${y}`).value = '서비스 · 메뉴별';
  s.getCell(`B${y}`).font = font({ size: 12, bold: true });
  y++;
  ['서비스', '1뎁스 메뉴', '2뎁스 화면', '항목', '통과', '연동', '차단'].forEach((h, i) => {
    const c = s.getCell(y, i + 2);
    c.value = h;
    c.font = font({ bold: true, color: { argb: C.headInk } });
    c.fill = fill(C.head);
    c.border = border;
    c.alignment = { horizontal: i < 3 ? 'left' : 'center' };
  });
  y++;
  // 화면이 "큰 탭 › 작은 탭" 구조인 GP 조합 메뉴는 큰 탭까지 묶는다
  const topOf = (x) => (x.service === 'GP' && x.screen.includes(' › ') ? x.screen.split(' › ')[0] : '');
  for (const g of groups((x) => [x.service, x.menu, topOf(x)].join('|'))) {
    const [bg, ink] = svcStyle(g[0].service);
    const vals = [g[0].service, topOf(g[0]) ? `${g[0].menu} › ${topOf(g[0])}` : g[0].menu, [...new Set(g.map((x) => (topOf(x) ? x.screen.split(' › ').slice(1).join(' › ') : x.screen)))].join(' · '), g.length, tally(g), g.filter((x) => x.kind.includes('연동')).length, g.filter((x) => x.kind.includes('차단')).length];
    vals.forEach((v, i) => {
      const c = s.getCell(y, i + 2);
      c.value = v;
      c.font = font({ bold: i === 1, color: { argb: i === 0 ? ink : i === 4 && g.some((x) => !x.ok) ? C.failInk : C.ink } });
      c.border = border;
      c.alignment = { horizontal: i < 3 ? 'left' : 'center', vertical: 'top', wrapText: i === 2 };
      if (i === 0) c.fill = fill(bg);
    });
    y++;
  }
  y++;
  s.getCell(`B${y}`).value = '서비스 · 메뉴 · 화면은 결과를 확인하는 화면 기준. 연동 = GP ↔ LP 사이에 도착하는지 · 차단 = 막혀야 할 것을 막는지 · "연동 API"는 화면 없이 GP가 부르는 LP API';
  s.getCell(`B${y}`).font = font({ size: 9, color: { argb: C.muted } });

  // ── 항목별
  const t = wb.addWorksheet('항목별', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1, showGridLines: false }] });
  t.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: '서비스', key: 'service', width: 8 },
    { header: '1뎁스 메뉴', key: 'menu', width: 13 },
    { header: '2뎁스 화면', key: 'screen', width: 24 },
    { header: '3뎁스 기능', key: 'feature', width: 32 },
    { header: '구분', key: 'kind', width: 10 },
    { header: '연동 (방향 · 상대 화면)', key: 'link', width: 34 },
    { header: '확인 내용', key: 'check', width: 40 },
    { header: '기대 결과', key: 'expected', width: 44 },
    { header: '결과', key: 'result', width: 8 },
    { header: '실제 값', key: 'actual', width: 48 },
    { header: '업무 단계', key: 'stage', width: 26 },
  ];
  t.getRow(1).eachCell((c) => {
    c.font = font({ bold: true, color: { argb: C.headInk } });
    c.fill = fill(C.head);
    c.border = border;
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  t.getRow(1).height = 24;
  let prevMenu = null;
  for (const x of rows) {
    const row = t.addRow({ ...x, link: x.link || '-', result: x.ok ? '통과' : '실패' });
    const menuKey = `${x.service}|${x.menu}`;
    const newGroup = prevMenu !== null && prevMenu !== menuKey;
    prevMenu = menuKey;
    row.eachCell((c) => {
      c.font = font();
      c.border = newGroup ? { ...border, top: { style: 'medium', color: { argb: C.strong } } } : border;
      c.alignment = { vertical: 'top', wrapText: true };
    });
    const [bg, ink] = svcStyle(x.service);
    row.getCell('service').fill = fill(bg);
    row.getCell('service').font = font({ bold: true, color: { argb: ink } });
    row.getCell('menu').font = font({ bold: true });
    const res = row.getCell('result');
    res.fill = fill(x.ok ? C.pass : C.fail);
    res.font = font({ bold: true, color: { argb: x.ok ? C.passInk : C.failInk } });
    res.alignment = { vertical: 'top', horizontal: 'center' };
    const kind = row.getCell('kind');
    if (x.kind.includes('연동')) {
      kind.fill = fill(C.gp);
      kind.font = font({ color: { argb: C.gpInk } });
    } else if (x.kind.includes('차단')) {
      kind.fill = fill(C.warn);
      kind.font = font({ color: { argb: C.warnInk } });
    }
    for (const k of ['link', 'actual', 'stage']) row.getCell(k).font = font({ size: 9, color: { argb: C.muted } });
  }
  t.autoFilter = { from: 'A1', to: `L${rows.length + 1}` };

  await wb.xlsx.writeFile(xlsxUrl instanceof URL ? xlsxUrl.pathname.replace(/^\/([A-Za-z]:)/, '$1') : xlsxUrl);
}
