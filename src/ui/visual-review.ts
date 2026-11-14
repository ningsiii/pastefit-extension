import { documentHtmlAdapter } from '../adapters/document-html';
import type { SemanticDocument } from '../core/semantic-document';
import { cleanFindings, inspectDocument, type Finding, type ReviewTarget } from '../core/preflight';
import { canCleanHidden, isHiddenFinding, reviewPreview, type ReviewDecision } from '../core/review-preview';

export const createVisualReview = (initial: SemanticDocument, target: ReviewTarget): { element: HTMLElement; getDocument: () => SemanticDocument } => {
  const root = document.createElement('section'); root.dataset.pastefitVisualReview = 'true'; root.setAttribute('aria-label', '隐藏字符检查');
  const fullReport = inspectDocument(initial, target);
  const report = { ...fullReport, findings: fullReport.findings.filter(isHiddenFinding).map(finding => ({ ...finding, replacement: finding.replacement ?? (finding.label.includes('格式边界') ? '' : /\s/u.test(finding.text ?? '') ? ' ' : '') })) };
  const decisions = new Map<string, ReviewDecision>(report.findings.map(finding => [finding.id, finding.suspicious ? 'change' : 'keep']));
  let after = false;
  const getDocument = (): SemanticDocument => cleanFindings(initial, report, new Set([...decisions].filter(([, d]) => d === 'change').map(([id]) => id)));
  const bar = document.createElement('div'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px';
  const summary = document.createElement('span'); summary.setAttribute('aria-live', 'polite'); summary.style.cssText = 'font:13px/1.6 sans-serif;color:#65748a;margin-right:auto';
  bar.append(summary);
  const page = document.createElement('div'); page.style.cssText = 'padding:22px;background:white;border:1px solid #e0e6ee;border-radius:10px;overflow:auto;max-height:62vh;font:16px/1.8 serif;overflow-wrap:anywhere;color:#18202a';
  const button = (label: string, text: string, action: () => void): HTMLButtonElement => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = label; b.setAttribute('aria-label', label);
    b.style.cssText = 'font:13px sans-serif;border:1px solid #dce3ec;border-radius:7px;padding:6px 10px;background:white;color:#42536b;cursor:pointer'; b.addEventListener('click', action); bar.append(b); return b;
  };
  const preview = button('查看结果', '查看结果', () => { after = !after; render(); });
  const clean = button('全部清理', '全部清理', () => {
    report.findings.forEach(finding => decisions.set(finding.id, 'change')); render();
  });
  const keep = button('全部保留', '全部保留', () => {
    report.findings.forEach(finding => decisions.set(finding.id, 'keep')); render();
  });
  const toggle = (finding: Finding): void => {
    if (!canCleanHidden(finding)) return;
    decisions.set(finding.id, decisions.get(finding.id) === 'change' ? 'keep' : 'change'); render();
    [...page.querySelectorAll<HTMLButtonElement>('[data-finding-id]')].find(mark => mark.dataset.findingId === finding.id)?.focus({ preventScroll: true });
  };
  const render = (): void => {
    page.replaceChildren();
    if (after) page.innerHTML = documentHtmlAdapter.render(getDocument()).value;
    else page.append(reviewPreview(initial, report, decisions, toggle));
    const previewLabel = after ? '返回标记' : '查看结果'; preview.textContent = previewLabel; preview.title = previewLabel; preview.setAttribute('aria-label', previewLabel); preview.setAttribute('aria-pressed', String(after));
    const changed = [...decisions.values()].filter(d => d === 'change').length;
    summary.textContent = report.findings.length ? `${changed} 处将清理，${report.findings.length - changed} 处保留` : '未发现隐藏字符';
    if (report.omitted) summary.textContent += ' · 内容较多，请分段检查';
    clean.disabled = changed === report.findings.length; keep.disabled = changed === 0;
  };
  root.append(bar, page); render();
  return { element: root, getDocument };
};
