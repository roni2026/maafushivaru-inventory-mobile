// ────────────────────────────────────────────────────────────────────────────
// parsers.js — turn raw OCR text into structured rows for each scan type.
//   • fuel  → [{ fuel_type, fuel_date, boat_name, qty, unit, month_key }]
//   • items → [{ part_number, product_name, qty, unit }]  (boat note / requisition)
//   • expiry→ [{ part_number, name, expiry_date }]
// All tolerant of messy line breaks from a phone photo.
// ────────────────────────────────────────────────────────────────────────────

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

export function normDate(raw, fallbackYear) {
  if (raw == null || raw === '') return '';
  let s = String(raw).trim();
  let m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})$/);
  if (m) {
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s*(\d{2,4})?$/);
  if (m) {
    const d = +m[1], mo = MONTHS[m[2].slice(0,3).toLowerCase()];
    let y = m[3] ? +m[3] : (fallbackYear || new Date().getFullYear());
    if (y < 100) y += 2000;
    if (mo) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s*(\d{2,4})?$/);
  if (m) {
    const mo = MONTHS[m[1].slice(0,3).toLowerCase()], d = +m[2];
    let y = m[3] ? +m[3] : (fallbackYear || new Date().getFullYear());
    if (y < 100) y += 2000;
    if (mo) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return '';
}

export const monthKeyOf = (iso) => (iso ? String(iso).slice(0, 7) : '');
const rid = () => Math.random().toString(36).slice(2);

// ── FUEL chits ───────────────────────────────────────────────────────────────
export function parseFuel(text, { defaultType = 'PETROL', defaultUnit = 'Ltrs' } = {}) {
  const rows = [];
  let curType = defaultType;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper.includes('DIESEL')) curType = 'DIESEL';
    else if (upper.includes('PETROL')) curType = 'PETROL';
    if (/total/i.test(line) && !/\d{1,2}[.\/-]\d{1,2}/.test(line)) continue;

    const dateMatch = line.match(/(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4})/) ||
                      line.match(/(\d{1,2}\s+[A-Za-z]{3,}\.?(?:\s+\d{2,4})?)/);
    if (!dateMatch) continue;
    const iso = normDate(dateMatch[1]);
    if (!iso) continue;

    let rest = line.replace(dateMatch[1], ' ').replace(/\b(PETROL|DIESEL)\b/ig, ' ').trim();
    const qtyMatch = rest.match(/(\d+(?:\.\d+)?)\s*(ltrs?|liters?|litres?|l)?\b/i);
    if (!qtyMatch) continue;
    const qn = parseFloat(qtyMatch[1]);
    if (!isFinite(qn) || qn <= 0) continue;
    const unit = qtyMatch[2] ? (qtyMatch[2].toLowerCase().startsWith('l') ? 'Ltrs' : qtyMatch[2]) : defaultUnit;
    let boat = rest.slice(0, qtyMatch.index).replace(/[|:;,]+/g, ' ').replace(/\b(qty|unit|boat|name|date)\b/ig, '').trim();
    if (!boat) boat = 'Unknown';
    rows.push({ id: rid(), fuel_type: curType, fuel_date: iso, boat_name: boat, qty: qn, unit, month_key: monthKeyOf(iso) });
  }
  return rows;
}

// ── ITEM lines (boat note / requisition): code + name + qty + unit ──────────
export function parseItems(text) {
  const rows = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || /total|product|description|department/i.test(line)) continue;
    // leading item code (4+ digits) then name then qty [unit]
    const m = line.match(/^(\d{4,})\s+(.+?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z./]{1,6})?$/);
    if (m) {
      rows.push({ id: rid(), part_number: m[1].replace(/^0+/, ''), product_name: m[2].trim(), qty: parseFloat(m[3]), unit: (m[4] || 'EA').toUpperCase() });
      continue;
    }
    // name then qty at the end (no code)
    const m2 = line.match(/^([A-Za-z].+?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z./]{1,6})?$/);
    if (m2 && /[A-Za-z]{3,}/.test(m2[1])) {
      rows.push({ id: rid(), part_number: '', product_name: m2[1].trim(), qty: parseFloat(m2[2]), unit: (m2[3] || 'EA').toUpperCase() });
    }
  }
  return rows;
}

// ── EXPIRY lines: (code) name … expiry-date ─────────────────────────────────
export function parseExpiry(text) {
  const rows = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const dm = line.match(/(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4})|(\d{1,2}\s+[A-Za-z]{3,}\.?(?:\s+\d{2,4})?)/);
    if (!dm) continue;
    const iso = normDate(dm[0]);
    if (!iso) continue;
    let rest = line.replace(dm[0], ' ').replace(/\b(exp|expiry|date|bb|best before)\b/ig, ' ').trim();
    const code = (rest.match(/\b(\d{4,})\b/) || [])[1] || '';
    const name = rest.replace(code, '').replace(/[|:;,]+/g, ' ').trim() || 'Item';
    rows.push({ id: rid(), part_number: code.replace(/^0+/, ''), name, expiry_date: iso });
  }
  return rows;
}
