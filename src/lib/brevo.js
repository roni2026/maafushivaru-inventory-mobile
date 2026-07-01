// ─────────────────────────────────────────────────────────────────────────────
// brevo.js (mobile) — send the Boat-Note receiving report by email via Brevo,
// with the formatted Excel workbook attached. Settings (API key, sender,
// recipient) are read from the shared `settings` table so the same configuration
// used by the web app applies here.
// ─────────────────────────────────────────────────────────────────────────────
import { CATEGORIES, counts as computeCounts, excelBase64, reportFileName } from './boatNoteReport';

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

// Load the email settings map from the DB.
export async function loadEmailSettings(supabase) {
  const { data } = await supabase.from('settings').select('key,value');
  return (data || []).reduce((a, s) => ({ ...a, [s.key]: s.value }), {});
}

function buildEmailHtml(note, c) {
  const label = note.label || note.note_date || 'Boat Note';
  const rows = [
    ['Received', c.received, '#15803d'],
    ['Damaged', c.damaged, '#b91c1c'],
    ['Wrong Item', c.wrong_item, '#ea580c'],
    ['Not Arrived', c.not_arrived, '#dc2626'],
    ['Pending', c.pending, '#ca8a04'],
  ].map(([l, n, col]) => `<tr>
      <td style="padding:8px 12px;font-family:Arial;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${l}</td>
      <td style="padding:8px 12px;font-family:Arial;font-size:14px;font-weight:700;color:${col};text-align:right;border-bottom:1px solid #f1f5f9;">${n}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:Arial;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#00AEEF;color:#fff;padding:18px 22px;">
        <h1 style="margin:0;font-size:18px;">Boat Note Receiving Report</h1>
        <p style="margin:6px 0 0;font-size:12px;">${label} · ${note.note_date || ''}</p>
      </div>
      <div style="padding:20px 22px;">
        <p style="font-size:13px;color:#475569;margin:0 0 14px;">The full categorised report is attached as an Excel file.</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
          <thead><tr>
            <th style="text-align:left;padding:8px 12px;background:#1e293b;color:#fff;font-size:11px;">Outcome</th>
            <th style="text-align:right;padding:8px 12px;background:#1e293b;color:#fff;font-size:11px;">Items</th>
          </tr></thead>
          <tbody>${rows}
            <tr><td style="padding:10px 12px;font-weight:700;">Total lines</td>
                <td style="padding:10px 12px;font-weight:700;text-align:right;">${c.total}</td></tr>
          </tbody>
        </table>
      </div>
    </div></body></html>`;
}

export async function sendBoatNoteReport(supabase, { note, lines, recipientEmail }) {
  const s = await loadEmailSettings(supabase);
  const apiKey = s.brevo_api_key;
  const senderEmail = s.brevo_sender_email;
  if (!apiKey) throw new Error('Brevo API key not set. Configure it in the web app Settings → Email Reports.');
  if (!senderEmail) throw new Error('Sender email not set. Configure it in the web app Settings → Email Reports.');
  const to = recipientEmail || s.report_recipient_email;
  if (!to) throw new Error('No recipient email — enter one or set it in Settings.');

  const c = computeCounts(lines);
  const label = note.label || note.note_date || 'Boat Note';
  const body = {
    sender: { name: s.brevo_sender_name || 'Roni — Store Assistant', email: senderEmail },
    to: [{ email: to, name: s.report_recipient_name || 'Manager' }],
    subject: `Boat Note Report — ${label} · ${c.received} received / ${c.total} lines`,
    htmlContent: buildEmailHtml(note, c),
    attachment: [{ content: excelBase64(note, lines), name: reportFileName(note, 'xlsx') }],
  };

  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Brevo API error ${res.status}`);
  }
  return { subject: body.subject, to, ...c };
}
