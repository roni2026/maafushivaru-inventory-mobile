// ────────────────────────────────────────────────────────────────────────────
// imageprep.js — light image processing before OCR so the text comes out clean.
//
// expo-image-manipulator handles the transforms available on-device: we
// straighten/normalise orientation, downscale very large photos to a sensible
// width (which sharpens dense text and keeps us under OCR.space's ~1 MB cap),
// and re-encode as a compressed JPEG. The result is returned as base64 ready
// for the OCR call.
// ────────────────────────────────────────────────────────────────────────────
import * as ImageManipulator from 'expo-image-manipulator';

// Target a width that keeps small printed text legible without bloating size.
const TARGET_WIDTH = 1500;

// uri → { uri, base64 } processed JPEG. `width` is the source photo width so we
// only downscale when it's actually larger than the target.
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
