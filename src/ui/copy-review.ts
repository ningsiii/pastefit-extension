import { inspectDocument, targetNames, type ReviewTarget } from '../core/preflight';
import type { SemanticDocument } from '../core/semantic-document';
import { createVisualReview } from './visual-review';

export const reviewDocument = (initial: SemanticDocument, target: ReviewTarget, reviewOnly = false, plainOnly = false): Promise<SemanticDocument | null> => new Promise(resolve => {
  document.querySelector('[data-pastefit-copy-review]')?.dispatchEvent(new Event('pastefit:dispose'));
  const opener = document.activeElement as HTMLElement | null;
  const panel = document.createElement('dialog'); panel.dataset.pastefitCopyReview = 'true'; panel.setAttribute('aria-label', '复制前检查');
  panel.style.cssText = 'all:initial;display:block;position:fixed;inset:12px;margin:auto;width:min(1000px,calc(100vw - 48px));max-height:calc(100vh - 72px);overflow:auto;box-sizing:border-box;padding:20px;border:1px solid #ccd9eb;border-radius:16px;background:white;color:#18202a;font:15px/1.6 sans-serif;z-index:2147483647;box-shadow:0 16px 64px #0f172a40';
  let settled = false;
  const finish = (value: SemanticDocument | null): void => { if (settled) return; settled = true; panel.remove(); opener?.focus(); resolve(value); };
  panel.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
  panel.addEventListener('pastefit:dispose', () => finish(null), { once: true });
  const header = document.createElement('div'); header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px';
  const heading = document.createElement('h2'); heading.textContent = '隐藏字符'; heading.style.cssText = 'font-size:20px;margin:0';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '取消'); close.title = '取消'; close.style.cssText = 'font:24px/1 sans-serif;border:0;background:transparent;color:#6c7c91;cursor:pointer;padding:4px 8px'; close.addEventListener('click', () => finish(null));
  header.append(heading, close);
  const visual = createVisualReview(initial, target);
  const message = document.createElement('p'); message.setAttribute('role', 'status'); message.style.cssText = 'margin:0';
  const details = document.createElement('details'); const title = document.createElement('summary'); title.textContent = '公式使用说明'; details.append(title);
  const report = inspectDocument(initial, target);
  if (report.formulas.length) {
    const note = document.createElement('p'); note.textContent = plainOnly ? '本次复制聊天文字，公式以源式输出。' : target === 'auto' ? '公式保留源式；Mac 原生公式可在设置中启用增强兼容。' : target === 'pages' ? '当前直接粘贴到 Pages 的公式仍为图片。下面可复制单个公式源，供 Pages「插入→方程」使用。整段直接粘贴成可编辑方程尚未解决。' : `${targetNames[target]} 的可编辑公式导入取决于软件版本，仍需实际验证。`; details.append(note);
    for (const [index, formula] of report.formulas.entries()) {
      const source = document.createElement('textarea'); source.readOnly = true; source.value = formula.source; source.setAttribute('aria-label', `公式 ${index + 1} 源式`); source.style.cssText = 'box-sizing:border-box;width:100%;min-height:52px;font:14px monospace';
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = `复制公式 ${index + 1} 源式`;
      copy.addEventListener('click', () => { void navigator.clipboard.writeText(formula.source).then(() => { message.textContent = `已复制公式 ${index + 1} 源式；整段内容尚未复制。`; }, () => { message.textContent = '公式源复制失败，可在源式框内全选后复制。'; }); });
      details.append(source, copy);
    }
  }
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;position:sticky;bottom:-20px;padding:12px 0;background:white';
  const button = (label: string, action: () => void): HTMLButtonElement => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'font:inherit;border:1px solid #aac0dc;border-radius:8px;padding:7px 12px;background:#f3f7fc;color:#18202a;cursor:pointer'; b.addEventListener('click', action); actions.append(b); return b; };
  const accept = button(reviewOnly ? '应用' : '复制', () => finish(visual.getDocument())); accept.style.background = '#0876ed'; accept.style.color = 'white';
  panel.append(header, visual.element); if (report.formulas.length) panel.append(details); panel.append(message, actions); document.body.append(panel);
  if (typeof panel.showModal === 'function') panel.showModal(); else panel.setAttribute('open', '');
  accept.focus();
});
