const VIEWPORT_GAP = 8;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest('button,a,input,textarea,select,[contenteditable="true"]'));

export const makePanelDraggable = (panel: HTMLElement, handle: HTMLElement): (() => void) => {
  let dragging = false;
  let positioned = false;
  let pointerId = -1;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let panelStartX = 0;
  let panelStartY = 0;
  let panelWidth = 0;
  let panelHeight = 0;

  handle.dataset.pastefitDragHandle = 'true';
  handle.style.cursor = 'grab';
  handle.style.touchAction = 'none';
  handle.style.userSelect = 'none';

  const place = (left: number, top: number): void => {
    const maxLeft = window.innerWidth - panelWidth - VIEWPORT_GAP;
    const maxTop = window.innerHeight - panelHeight - VIEWPORT_GAP;
    panel.style.left = `${Math.round(clamp(left, VIEWPORT_GAP, maxLeft))}px`;
    panel.style.top = `${Math.round(clamp(top, VIEWPORT_GAP, maxTop))}px`;
  };

  const pinCurrentPosition = (): DOMRect => {
    const rect = panel.getBoundingClientRect();
    panelWidth = rect.width;
    panelHeight = rect.height;
    panel.style.position = 'fixed';
    panel.style.inset = 'auto';
    panel.style.margin = '0';
    panel.style.transform = 'none';
    positioned = true;
    place(rect.left, rect.top);
    return rect;
  };

  const finish = (): void => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = 'grab';
    delete panel.dataset.pastefitDragging;
    try { handle.releasePointerCapture?.(pointerId); } catch { /* Capture may already be released. */ }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    const rect = pinCurrentPosition();
    dragging = true;
    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    panelStartX = rect.left;
    panelStartY = rect.top;
    handle.style.cursor = 'grabbing';
    panel.dataset.pastefitDragging = 'true';
    try { handle.setPointerCapture?.(pointerId); } catch { /* Synthetic events may not support capture. */ }
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || event.pointerId !== pointerId) return;
    place(panelStartX + event.clientX - pointerStartX, panelStartY + event.clientY - pointerStartY);
  };

  const onResize = (): void => {
    if (!positioned) return;
    const rect = panel.getBoundingClientRect();
    panelWidth = rect.width;
    panelHeight = rect.height;
    place(rect.left, rect.top);
  };

  handle.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('resize', onResize);

  const cleanup = (): void => {
    finish();
    handle.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    window.removeEventListener('resize', onResize);
    panel.removeEventListener('pastefit:dispose', cleanup);
  };
  panel.addEventListener('pastefit:dispose', cleanup);
  return cleanup;
};
