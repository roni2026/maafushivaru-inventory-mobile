// Small date / number helpers shared across screens.

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / 86400000);
}

// Monday-start current week range as ISO date strings { from, to }.
export function thisWeekRange() {
  const now = new Date();
  const day = now.getDay();                 // 0 = Sun
  const diffToMon = (day + 6) % 7;          // days since Monday
  const monday = new Date(now); monday.setDate(now.getDate() - diffToMon);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const iso = (d) => d.toISOString().split('T')[0];
  return { from: iso(monday), to: iso(sunday) };
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
}

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
