const elementOf = (node: Node): Element | null => node instanceof Element ? node : node.parentElement;
// Range rectangles include text clipped by nested scrolling containers. Anchor
// only to visible selected text, above the first visible line of the selection.
export const visibleSelectionAnchor = (range: Range): { left: number; top: number; bottom: number } | null => {
  let left = 0; let right = innerWidth; let top = 0; let bottom = innerHeight;
  for (let ancestor = elementOf(range.commonAncestorContainer); ancestor; ancestor = ancestor.parentElement) {
    const css = getComputedStyle(ancestor);
    const clipX = /^(auto|scroll|hidden|clip)$/.test(css.overflowX || css.overflow);
    const clipY = /^(auto|scroll|hidden|clip)$/.test(css.overflowY || css.overflow);
    if (!clipX && !clipY) continue;
    const bounds = ancestor.getBoundingClientRect();
    if (clipX) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
    if (clipY) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
  }
  if (left >= right || top >= bottom) return null;
  const rects = [...range.getClientRects()];
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index];
    if (rect.bottom <= top || rect.top >= bottom || rect.right <= left || rect.left >= right) continue;
    return { left: Math.max(left, rect.left), top: Math.max(top, rect.top),
      bottom: Math.min(bottom, Math.max(...rects.filter(line => line.bottom > top && line.top < bottom && line.right > left && line.left < right).map(line => line.bottom))) };
  }
  return null;
};

