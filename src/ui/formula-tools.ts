import { readMath, type MathNode } from '../core/math';

// This is a contextual action for one equation, not a second whole-document copy mode.
export const createFormulaTools = (message: HTMLElement, editor: HTMLElement): { element: HTMLDivElement; refresh: () => void } => {
  const element = document.createElement('div'); element.hidden = true; element.setAttribute('aria-label', '所选公式');
  element.style.cssText = 'font:12px/1.5 sans-serif;color:#5b6572';
  const copy = document.createElement('button'); copy.type = 'button'; copy.setAttribute('aria-label', '复制当前公式源码');
  copy.style.cssText = 'font:inherit;padding:4px 8px;border:1px solid #dfe6f2;border-radius:7px;background:white;color:#1e2c50;cursor:pointer';
  const limitation = document.createElement('span'); limitation.hidden = true; limitation.textContent = ' 此公式仅有 MathML，不能直接用于 WPS 公式框。';
  element.append(copy, limitation); let selected: MathNode | null = null;
  const refresh = (): void => { selected = null; element.hidden = true; };
  editor.addEventListener('click', event => {
    const atom = event.target instanceof Element ? event.target.closest('math,[data-math-source]') : null;
    selected = atom && editor.contains(atom) ? readMath(atom) : null; element.hidden = !selected;
    if (selected) { copy.textContent = selected.format === 'latex' ? '复制此公式源码' : '复制 MathML'; limitation.hidden = selected.format !== 'mathml'; }
  });
  copy.addEventListener('click', () => {
    if (!selected) return;
    void navigator.clipboard.writeText(selected.source).then(() => { message.textContent = '已复制公式源码'; }, () => { message.textContent = '公式源码复制失败，请重试。'; });
  });
  return { element, refresh };
};
