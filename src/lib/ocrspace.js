// ────────────────────────────────────────────────────────────────────────────
// ocrspace.js — OCR via the OCR.space cloud API (Space OCR), mobile edition.
//
// We send the captured photo as a base64 data-URI (no multipart file upload),
// which is the most reliable path on React Native. Engine 2 + table mode give
// the best results on printed forms / chits.
//
// Free/registered plan limit: ~1 MB per image — the image-prep step downscales
// and compresses the photo before it reaches here so we stay under the cap.
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_OCR_API_KEY = 'K88109865088957';
const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';

// Run OCR on a base64-encoded JPEG. `onProgress({label,pct})` drives a UI bar.
export async function ocrSpaceBase64(base64, { apiKey, isTable = true, onProgress } = {}) {
  if (!base64) throw new Error('No image data');
  onProgress?.({ label: 'Uploading to OCR…', pct: 30 });

  const form = new FormData();
  form.append('base64Image', `data:image/jpeg;base64,${base64}`);
  form.append('apikey', apiKey || DEFAULT_OCR_API_KEY);
  form.append('language', 'eng');
  form.append('isOverlayRequired', 'false');
  form.append('detectOrientation', 'true');
  form.append('scale', 'true');
  form.append('isTable', isTable ? 'true' : 'false');
  form.append('OCREngine', '2');

  onProgress?.({ label: 'Recognising text…', pct: 60 });

  let res;
  try {
    res = await fetch(OCR_ENDPOINT, { method: 'POST', body: form });
  } catch (e) {
    throw new Error('Network error contacting OCR service. Check your connection.');
  }
  if (!res.ok) throw new Error(`OCR service error ${res.status}`);

  const data = await res.json().catch(() => ({}));
  if (data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(' ') : (data.ErrorMessage || 'OCR failed');
    throw new Error(msg);
  }
  onProgress?.({ label: 'Parsing results…', pct: 90 });
  return (data.ParsedResults || []).map((r) => r.ParsedText || '').join('\n');
}
