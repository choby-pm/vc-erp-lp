// QA 결과지 엑셀 (qa-report.mjs 가 만든 docs/qa-reports/<날짜>.json → <날짜>.xlsx). 구글 드라이브에 올리면 구글 시트로 열린다
// 탭: "요약"(결과 · 환경 · 단계별) · "항목별"(45개 전부, 필터 · 머리글 고정 · 통과/실패 색)
import fs from 'node:fs';
import ExcelJS from 'exceljs';

export async function writeXlsx(jsonUrl, xlsxUrl) {
  const r = JSON.parse(fs.readFileSync(jsonUrl, 'utf8'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VC ERP QA';
  wb.created = new Date(r.at);
  const FONT = 'Malgun Gothic';
  const C = { ink: 'FF15211F', muted: 'FF5B6B68', head: 'FFE7F6F0', headInk: 'FF065F46', pass: 'FFE7F6F0', passInk: 'FF047857', fail: 'FFFDE8E8', failInk: 'FFB91C1C', rule: 'FFDDE5E3', lp: 'FFE7F6F0', gp: 'FFEEF0FF', gpInk: 'FF4338CA', warn: 'FFFFF4E5', warnInk: 'FFB45309' };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const border = { top: { style: 'thin', color: { argb: C.rule } }, bottom: { style: 'thin', color: { argb: C.rule } }, left: { style: 'thin', color: { argb: C.rule } }, right: { style: 'thin', color: { argb: C.rule } } };
  const kst = new Date(r.at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
  const rows = r.rows;
  const passed = rows.filter((x) => x.ok).length;
  const count = (pred) => `${rows.filter((x) => pred(x) && x.ok).length} / ${rows.filter(pred).length}`;

  // ── 요약
  const s = wb.addWorksheet('요약', { views: [{ showGridLines: false }] });
  s.columns = [{ width: 4 }, { width: 46 }, { width: 14 }, { width: 10 }, { width: 10 }];
  s.getCell('B2').value = `QA 결과지 — ${r.date}`;
  s.getCell('B2').font = { name: FONT, size: 16, bold: true, color: { argb: C.ink } };
  s.getCell('B3').value = 'GP · LP 업무 흐름 순서 QA (docs/96_qa_scenarios.md) — 배포 사이트에 실제로 요청해 확인한 결과';
  s.getCell('B3').font = { name: FONT, size: 10, color: { argb: C.muted } };
  const info = [
    ['결과', passed === rows.length ? `전체 통과 — ${passed} / ${rows.length}` : `실패 ${rows.length - passed}건 — ${passed} / ${rows.length}`],
    ['연동 확인 (GP ↔ LP)', count((x) => x.kind.includes('연동'))],
    ['차단 확인 (막아야 할 것)', count((x) => x.kind.includes('차단'))],
    ['실행 시각 (KST)', kst],
    ['환경', '배포 LP vc-erp-lp.vercel.app ↔ 배포 GP vc-erp-gp.vercel.app (데모 DB)'],
    ['코드 버전', `LP ${r.lp} · GP ${r.gp}`],
    ['데이터', '데모 시드 시작 상태에서 실행 → 끝난 뒤 짝 맞춘 데모 갱신으로 되돌림'],
  ];
  let y = 5;
  for (const [k, v] of info) {
    s.getCell(`B${y}`).value = k;
    s.mergeCells(`C${y}:E${y}`);
    s.getCell(`C${y}`).value = v;
    s.getCell(`B${y}`).font = { name: FONT, size: 10, color: { argb: C.muted } };
    s.getCell(`C${y}`).font = { name: FONT, size: 11, bold: k === '결과', color: { argb: k === '결과' ? (passed === rows.length ? C.passInk : C.failInk) : C.ink } };
    for (const col of ['B', 'C', 'D', 'E']) s.getCell(`${col}${y}`).border = { bottom: { style: 'thin', color: { argb: C.rule } } };
    y++;
  }
  y += 1;
  s.getCell(`B${y}`).value = '단계별';
  s.getCell(`B${y}`).font = { name: FONT, size: 12, bold: true, color: { argb: C.ink } };
  y++;
  const head = ['단계', '통과', '연동', '차단'];
  head.forEach((h, i) => {
    const c = s.getCell(y, i + 2);
    c.value = h;
    c.font = { name: FONT, size: 10, bold: true, color: { argb: C.headInk } };
    c.fill = fill(C.head);
    c.border = border;
    c.alignment = { horizontal: i === 0 ? 'left' : 'center' };
  });
  y++;
  for (const st of [...new Set(rows.map((x) => x.stage))]) {
    const g = rows.filter((x) => x.stage === st);
    const vals = [st, `${g.filter((x) => x.ok).length} / ${g.length}`, g.filter((x) => x.kind.includes('연동')).length, g.filter((x) => x.kind.includes('차단')).length];
    vals.forEach((v, i) => {
      const c = s.getCell(y, i + 2);
      c.value = v;
      c.font = { name: FONT, size: 10, color: { argb: i === 1 && g.some((x) => !x.ok) ? C.failInk : C.ink } };
      c.border = border;
      c.alignment = { horizontal: i === 0 ? 'left' : 'center' };
    });
    y++;
  }
  y++;
  s.getCell(`B${y}`).value = '구분 — 연동: GP에서 한 일이 LP에 (또는 반대로) 도착하는지 · 차단: 막혀야 할 것을 막는지 · 기능: 한 시스템 안의 흐름';
  s.getCell(`B${y}`).font = { name: FONT, size: 9, color: { argb: C.muted } };

  // ── 항목별
  const t = wb.addWorksheet('항목별', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  t.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: '단계', key: 'stage', width: 26 },
    { header: '구분', key: 'kind', width: 11 },
    { header: '확인', key: 'check', width: 44 },
    { header: '기대 결과', key: 'expected', width: 48 },
    { header: '결과', key: 'result', width: 9 },
    { header: '실제 값', key: 'actual', width: 52 },
  ];
  t.getRow(1).eachCell((c) => {
    c.font = { name: FONT, size: 10, bold: true, color: { argb: C.headInk } };
    c.fill = fill(C.head);
    c.border = border;
    c.alignment = { vertical: 'middle' };
  });
  t.getRow(1).height = 22;
  const plain = (v) => String(v).replace(/\*\*/g, '').replace(/`/g, '');
  for (const x of rows) {
    const row = t.addRow({ id: x.id, stage: x.stage, kind: x.kind, check: plain(x.check), expected: plain(x.expected), result: x.ok ? '통과' : '실패', actual: x.actual });
    row.eachCell((c) => {
      c.font = { name: FONT, size: 10, color: { argb: C.ink } };
      c.border = border;
      c.alignment = { vertical: 'top', wrapText: true };
    });
    const res = row.getCell('result');
    res.fill = fill(x.ok ? C.pass : C.fail);
    res.font = { name: FONT, size: 10, bold: true, color: { argb: x.ok ? C.passInk : C.failInk } };
    res.alignment = { vertical: 'top', horizontal: 'center' };
    const kind = row.getCell('kind');
    if (x.kind.includes('연동')) {
      kind.fill = fill(C.gp);
      kind.font = { name: FONT, size: 10, color: { argb: C.gpInk } };
    } else if (x.kind.includes('차단')) {
      kind.fill = fill(C.warn);
      kind.font = { name: FONT, size: 10, color: { argb: C.warnInk } };
    }
    row.getCell('actual').font = { name: FONT, size: 9, color: { argb: C.muted } };
  }
  t.autoFilter = { from: 'A1', to: `G${rows.length + 1}` };

  await wb.xlsx.writeFile(xlsxUrl instanceof URL ? xlsxUrl.pathname.replace(/^\/([A-Za-z]:)/, '$1') : xlsxUrl);
}
