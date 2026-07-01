// ─────────────────────────────────────────────────────────────────────────────
// imageprep.js — image processing helpers (expo-image-manipulator).
//
//  • prepForOcr(uri, width)          → light downscale + compress for OCR.
//  • compressImageToLimit(uri, opts) → aggressively downscale + re-encode a photo
//    until it is a JPEG under a hard byte cap (default 300 KB). Handles very large
//    source photos (e.g. 20 MB) by shrinking the longest edge and stepping quality
//    down. Returns { uri, base64, bytes, width, height }.
// ─────────────────────────────────────────────────────────────────────────────
import * as ImageManipulator from 'expo-image-manipulator';

const TARGET_WIDTH = 1500;

// uri → { uri, base64 } processed JPEG for OCR.
export async function prepForOcr(uri, sourceWidth) {
  const actions = [];
  if (!sourceWidth || sourceWidth > TARGET_WIDTH) {
    actions.push({ resize: { width: TARGET_WIDTH } });
  }
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return { uri: result.uri, base64: result.base64 };
}

// Approx decoded byte size of a base64 string.
function base64Bytes(b64) {
  if (!b64) return 0;
  const len = b64.length;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

const MAX_BYTES = 300 * 1024; // 300 KB
const START_EDGE = 1600;
const MIN_EDGE = 640;
const MIN_QUALITY = 0.4;

// Compress any photo to a JPEG under `maxBytes` while keeping quality as high as
// possible. Returns the best result even if the cap can't quite be met at the
// smallest settings.
export async function compressImageToLimit(uri, { maxBytes = MAX_BYTES } = {}) {
  let edge = START_EDGE;
  let best = null;

  while (edge >= MIN_EDGE) {
    let quality = 0.9;
    while (quality >= MIN_QUALITY) {
      const res = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: edge } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const bytes = base64Bytes(res.base64);
      if (!best || bytes < best.bytes) best = { uri: res.uri, base64: res.base64, bytes, width: res.width, height: res.height };
      if (bytes <= maxBytes) {
        return { uri: res.uri, base64: res.base64, bytes, width: res.width, height: res.height };
      }
      quality -= 0.1;
    }
    edge = Math.round(edge * 0.8);
  }
  return best;
}
