// ─────────────────────────────────────────────────────────────────────────────
// boatNoteReport.js (mobile) — professional, categorised Boat-Note reports.
//
//   • printReport(note, lines)      → open the OS print sheet (print / Save-PDF).
//   • sharePdf(note, lines)         → render to a PDF file and open the share sheet.
//   • shareExcel(note, lines)       → build a formatted .xlsx and share it.
//   • excelBase64(note, lines)      → base64 workbook for email (Brevo) attachment.
//
// Categories order: Received, Damaged, Wrong Item, Not Arrived, Pending.
// ─────────────────────────────────────────────────────────────────────────────
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';

export const CATEGORIES = [
  { key: 'received',    label: 'Received',    hex: '#15803d' },
  { key: 'damaged',     label: 'Damaged',     hex: '#b91c1c' },
  { key: 'wrong_item',  label: 'Wrong Item',  hex: '#ea580c' },
  { key: 'not_arrived', label: 'Not Arrived', hex: '#dc2626' },
  { key: 'short',       label: 'Short',       hex: '#b45309' },
  { key: 'pending',     label: 'Pending',     hex: '#ca8a04' },
];
const KNOWN = ['received', 'damaged', 'wrong_item', 'not_arrived', 'short'];
// Affected-unit count for a delivery problem (damaged / short / wrong).
const issueQty = (it) => {
  const v = it.damaged_qty ?? it.short_qty ?? it.wrong_qty;
  return (v === null || v === undefined || v === '') ? '' : Number(v);
};

export function bucketize(lines, sortBy = 'line_no', sortDir = 'asc') {
  const map = {};
  CATEGORIES.forEach((c) => { map[c.key] = []; });
  for (const l of lines) {
    const k = KNOWN.includes(l.status) ? l.status : 'pending';
    map[k].push(l);
  }
  const cmp = (a, b) => {
    let av = a[sortBy], bv = b[sortBy];
    if (['ordered_qty', 'received_qty', 'line_no'].includes(sortBy)) { av = Number(av) || 0; bv = Number(bv) || 0; }
    else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  };
  Object.values(map).forEach((arr) => arr.sort(cmp));
  return map;
}

export function counts(lines) {
  const c = { total: lines.length };
  CATEGORIES.forEach((cat) => {
    c[cat.key] = lines.filter((l) => (cat.key === 'pending' ? !KNOWN.includes(l.status) : l.status === cat.key)).length;
  });
  return c;
}

export function reportFileName(note, ext) {
  const label = String(note.label || note.note_date || 'boat-note').replace(/[^\w-]+/g, '_');
  return `BoatNote_Report_${label}.${ext}`;
}

const esc = (v) => String(v ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

export function buildHtml(note, lines, opts = {}) {
  const buckets = bucketize(lines, opts.sortBy, opts.sortDir);
  const label = note.label || note.note_date || 'Boat Note';
  const c = counts(lines);

  const section = (cat) => {
    const items = buckets[cat.key];
    if (!items.length) return '';
    const rows = items.map((it, i) => `
      <tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
        <td>${esc(it.line_no)}</td>
        <td style="font-family:monospace">${esc(it.part_number)}</td>
        <td><strong>${esc(it.product_name)}</strong></td>
        <td>${esc(it.department)}</td>
        <td>${esc(it.unit)}</td>
        <td style="text-align:center">${esc(it.ordered_qty)}</td>
        <td style="text-align:center">${esc(it.received_qty ?? '—')}</td>
        <td style="text-align:center">${esc(issueQty(it) === '' ? '—' : issueQty(it))}</td>
        <td>${esc(it.expiry_date || '—')}</td>
        <td>${esc(it.supplier)}</td>
        <td style="font-family:monospace">${esc(it.po_number || '—')}</td>
        <td>${esc(it.note || '')}</td>
      </tr>`).join('');
    return `
      <h2 style="margin:20px 0 6px;color:${cat.hex};font-size:14px;border-bottom:2px solid ${cat.hex};padding-bottom:4px">
        ${cat.label} <span style="color:#94a3b8;font-weight:400">(${items.length})</span>
      </h2>
      <table><thead><tr>
        <th>#</th><th>Code</th><th>Product</th><th>Dept</th><th>Unit</th>
        <th>Ord.</th><th>Rcvd</th><th>Issue Qty</th><th>Expiry</th><th>Supplier</th><th>PO</th><th>Note</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  };

  const summary = CATEGORIES.map((cat) => `${cat.label}: <strong>${c[cat.key]}</strong>`).join(' &nbsp;·&nbsp; ');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
      *{box-sizing:border-box} body{font-family:-apple-system,Arial,sans-serif;color:#1e293b;margin:0;padding:16px;font-size:12px}
      .band{background:#00AEEF;color:#fff;padding:14px 18px;border-radius:8px}
      .band h1{margin:0;font-size:17px} .band p{margin:4px 0 0;font-size:11px}
      table{width:100%;border-collapse:collapse;margin-top:2px}
      th{background:#1e293b;color:#fff;font-size:9px;padding:5px 6px;text-align:left}
      td{border:1px solid #e2e8f0;padding:4px 6px;font-size:10px;vertical-align:top}
    </style></head><body>
      <div class="band">
        <h1>Boat Note Receiving Report — ${esc(label)}</h1>
        <p>Date ${esc(note.note_date || '—')} · Total lines ${lines.length}</p>
        <p>${summary}</p>
      </div>
      ${CATEGORIES.map(section).join('')}
    </body></html>`;
}

export async function printReport(note, lines, opts) {
  await Print.printAsync({ html: buildHtml(note, lines, opts) });
}

export async function sharePdf(note, lines, opts) {
  const { uri } = await Print.printToFileAsync({ html: buildHtml(note, lines, opts) });
  const dest = `${FileSystem.cacheDirectory}${reportFileName(note, 'pdf')}`;
  try { await FileSystem.moveAsync({ from: uri, to: dest }); } catch { /* fall back to uri */ }
  const finalUri = (await FileSystem.getInfoAsync(dest)).exists ? dest : uri;
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  return finalUri;
}

// Build a categorised workbook (SheetJS). Sheet 1 = categorised, Sheet 2 = all.
function buildWorkbook(note, lines, opts) {
  const buckets = bucketize(lines, opts?.sortBy, opts?.sortDir);
  const header = ['#', 'Code', 'Product', 'Dept', 'Unit', 'Ordered', 'Received', 'Issue Qty', 'Expiry', 'Supplier', 'PO', 'Note'];
  const rowOf = (it) => [it.line_no ?? '', it.part_number || '', it.product_name || '', it.department || '', it.unit || '',
    Number(it.ordered_qty) || 0, it.received_qty ?? '', issueQty(it), it.expiry_date || '', it.supplier || '', it.po_number || '', it.note || ''];

  const aoa = [
    [`Boat Note Receiving Report — ${note.label || note.note_date || 'Boat Note'}`],
    [`Date ${note.note_date || '—'} · Total lines ${lines.length} · Generated ${new Date().toLocaleString('en-GB')}`],
    [],
  ];
  for (const cat of CATEGORIES) {
    const items = buckets[cat.key];
    if (!items.length) continue;
    aoa.push([`${cat.label.toUpperCase()} (${items.length})`]);
    aoa.push(header);
    items.forEach((it) => aoa.push(rowOf(it)));
    aoa.push([]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 7 }, { wch: 9 }, { wch: 9 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 24 }];

  // Flat sheet with autofilter (sortable in Excel).
  const flat = [['Status', ...header]];
  for (const cat of CATEGORIES) buckets[cat.key].forEach((it) => flat.push([cat.label, ...rowOf(it)]));
  const ws2 = XLSX.utils.aoa_to_sheet(flat);
  ws2['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, flat.length - 1), c: header.length } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Boat Note Report');
  XLSX.utils.book_append_sheet(wb, ws2, 'All Items');
  return wb;
}

export function excelBase64(note, lines, opts) {
  const wb = buildWorkbook(note, lines, opts);
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

export async function shareExcel(note, lines, opts) {
  const b64 = excelBase64(note, lines, opts);
  const uri = `${FileSystem.cacheDirectory}${reportFileName(note, 'xlsx')}`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
  return uri;
}
