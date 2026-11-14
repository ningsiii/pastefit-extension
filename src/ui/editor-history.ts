// Keep programmatic symbol insertion and ordinary typing in one reversible history.
export const editorHistory = (editor: HTMLElement, changed: () => void): { push: (range?: Range | null) => void; dispose: () => void } => {
  type Point = { path: number[]; offset: number };
  type Snapshot = { html: string; start?: Point; end?: Point };
  const past: Snapshot[] = []; const future: Snapshot[] = [];
  const point = (node: Node, offset: number): Point => {
    const path: number[] = [];
    while (node !== editor && node.parentNode) { path.unshift([...node.parentNode.childNodes].indexOf(node as ChildNode)); node = node.parentNode; }
    return { path, offset };
  };
  const snapshot = (range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null): Snapshot => {
    const result: Snapshot = { html: editor.innerHTML };
    if (range && editor.contains(range.commonAncestorContainer)) { result.start = point(range.startContainer, range.startOffset); result.end = point(range.endContainer, range.endOffset); }
    return result;
  };
  const restore = (value: Snapshot): void => {
    editor.innerHTML = value.html; editor.focus();
    const locate = (p: Point): Node => p.path.reduce<Node>((node, i) => node.childNodes[i] ?? node, editor);
    if (value.start && value.end) {
      const range = document.createRange(); const start = locate(value.start); const end = locate(value.end);
      const limit = (node: Node) => node.nodeType === Node.TEXT_NODE ? node.textContent!.length : node.childNodes.length;
      range.setStart(start, Math.min(value.start.offset, limit(start))); range.setEnd(end, Math.min(value.end.offset, limit(end)));
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    }
    changed();
  };
  const push = (range?: Range | null): void => { past.push(snapshot(range)); if (past.length > 100) past.shift(); future.length = 0; };
  const travel = (redo: boolean): void => {
    const from = redo ? future : past; const to = redo ? past : future; const previous = from.pop();
    if (!previous) return; to.push(snapshot()); restore(previous);
  };
  const before = (event: InputEvent): void => {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); travel(event.inputType === 'historyRedo'); }
    else push();
  };
  const key = (event: KeyboardEvent): void => {
    if (event.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    const lower = event.key.toLowerCase();
    if (lower === 'z' || (event.ctrlKey && lower === 'y')) { event.preventDefault(); travel(event.shiftKey || lower === 'y'); }
  };
  editor.addEventListener('beforeinput', before); editor.addEventListener('keydown', key);
  return { push, dispose: () => { editor.removeEventListener('beforeinput', before); editor.removeEventListener('keydown', key); } };
};
