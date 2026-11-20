// Maths for cropping a dragged page area out of a tab screenshot.

export const MIN_AREA_PX = 20;
export const MAX_SIDE_PX = 1600;

// rect is in page (CSS) pixels; the screenshot can be bigger (retina, zoom), so the scale is
// screenshot width / viewport width. Returns null when the area is too small or off-screen.
export function cropPlan(rect, viewportWidth, imageW, imageH, maxSide = MAX_SIDE_PX) {
  if (!rect || rect.width < MIN_AREA_PX || rect.height < MIN_AREA_PX) return null;
  const scale = imageW / viewportWidth;
  const sx = Math.max(0, Math.min(imageW, Math.round(rect.x * scale)));
  const sy = Math.max(0, Math.min(imageH, Math.round(rect.y * scale)));
  const sw = Math.min(Math.round(rect.width * scale), imageW - sx);
  const sh = Math.min(Math.round(rect.height * scale), imageH - sy);
  if (sw <= 0 || sh <= 0) return null;
  const factor = Math.min(1, maxSide / Math.max(sw, sh));
  return { sx, sy, sw, sh, dw: Math.round(sw * factor), dh: Math.round(sh * factor) };
}
