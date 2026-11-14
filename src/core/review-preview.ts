import { documentHtmlAdapter } from '../adapters/document-html';
import type { SemanticDocument } from './semantic-document';
import { isUnexpectedControl, mapDocumentText, type Finding, type PreflightReport } from './preflight';

export type ReviewDecision = 'keep' | 'change';
// This surface reveals whitespace/control characters, not visible prose or placeholders.
export const isHiddenFinding = (finding: Finding): boolean => Boolean(finding.text && (isUnexpectedControl(finding.text) || /^[\s\u200b-\u200f\u2060\ufeff\u00ad\u061c\u202a-\u202e\u2066-\u2069]+$/u.test(finding.text)));
export const canCleanHidden = (finding: Finding): boolean => isHiddenFinding(finding);

export const findingName = (finding: Finding): string => {
  if (finding.protected) return '数字和单位之间的空格';
  if (isUnexpectedControl(finding.text ?? '')) return '控制字符';
  const names: Record<string, string> = { '\u00a0': '不换行空格', '\u202f': '窄空格', '\u200b': '零宽空格', '\ufeff': '隐藏连接字符', '\u00ad': '隐藏断词符', '\u2009': '细空格', '\u200a': '细空格', '\u200c': '外文字形连接符', '\u200d': '字形连接符', '\u2060': '防换行连接符' };
  if (finding.text && names[finding.text]) return names[finding.text];
  if (finding.label.includes('方向控制')) return '外文阅读方向标记';
  if (finding.label.includes('引用标记')) return '疑似引用残留';
  if (finding.label.includes('占位')) return '待补充占位';
  if (finding.label.includes('标点前')) return '标点前的空白';
  if (finding.label.includes('连续空格')) return '连续空白';
  if (finding.label.includes('全角空格')) return '中文缩进空格';
  if (finding.label.includes('Markdown')) return '字面 Markdown 标记';
  if (finding.label.includes('格式边界')) return '格式交界处的空格';
  return '疑似格式残留';
};
export const findingHelp = (finding: Finding): string => {
  if (finding.protected) return '这个空格让数字和单位保持在同一行。建议保留；改成普通空格后可能分到两行。';
  if (finding.replacement === ' ') return '可改成一个普通空格。文字保持不变，但间距或换行可能变化。';
  if (findingName(finding) === '疑似引用残留') return '这里看起来像没有正确显示的引用。删除前请确认不需要保留或补全来源。';
  if (findingName(finding) === '待补充占位') return '这里可能还需要补充内容。可以保留，或确认不需要后删除。';
  if (finding.replacement === '') return '可移除标出的字符，周围文字保持不变。请查看处理后效果再决定。';
  return '这个标记可能有排版或语言用途，默认保护。若需要修改，请返回编辑器；这里不提供一键删除。';
};

// Render the normal document adapter with unique text tokens, then replace
// tokens using DOM nodes. No user strings become HTML, and annotation controls
// never enter the document that is copied or exported.
export const reviewPreview = (doc: SemanticDocument, report: PreflightReport, decisions: ReadonlyMap<string, ReviewDecision>, onSelect: (finding: Finding) => void): HTMLElement => {
  const root = document.createElement('div'); root.dataset.pastefitPreview = 'true';
  const tokens = new Map<string, { value: string; path: string }>(); const prefix = `PF${crypto.randomUUID().replaceAll('-', '')}_`;
  const marked = mapDocumentText(doc, (value, path) => { const key = `${prefix}${tokens.size}END`; tokens.set(key, { value, path }); return key; });
  root.innerHTML = documentHtmlAdapter.render(marked).value;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  const regex = new RegExp(`${prefix}\\d+END`, 'g');
  for (const text of texts) {
    const matches = [...text.data.matchAll(regex)]; if (!matches.length) continue;
    const fragment = document.createDocumentFragment(); let offset = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(text.data.slice(offset, match.index)));
      const token = tokens.get(match[0]); if (!token) continue;
      const findings = report.findings.filter(f => f.path === token.path).sort((a, b) => a.start - b.start);
      let cursor = 0;
      for (const finding of findings) {
        fragment.append(document.createTextNode(token.value.slice(cursor, finding.start)));
        const button = document.createElement('button'); button.type = 'button'; button.dataset.findingId = finding.id;
        const decision = decisions.get(finding.id); button.dataset.decision = decision ?? 'pending';
        const literal = token.value.slice(finding.start, finding.end);
        button.textContent = /\s/u.test(literal) ? '〔空格〕' : '〔隐〕';
        const state = decision === 'change' ? '将清理' : decision === 'keep' || finding.protected || finding.replacement === undefined ? '保留' : '待选择';
        button.setAttribute('aria-label', `${findingName(finding)}，${state}，${finding.location}`);
        const cleanable = canCleanHidden(finding);
        const operation = decision === 'change' ? (finding.replacement === ' ' ? '将改为普通空格 · 点击保留' : '将移除 · 点击保留') : cleanable ? '点击清理' : '保留';
        const code = literal.length === 1 ? ` · U+${literal.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}` : '';
        button.title = `${findingName(finding)}${code} · ${operation}`;
        button.setAttribute('aria-pressed', String(decision === 'change'));

        const color = decision === 'change' ? '#ffe1df' : decision === 'keep' || finding.protected || finding.replacement === undefined ? '#dcecff' : '#fff0b4';
        button.style.cssText = `font:inherit;line-height:inherit;display:inline-block;white-space:nowrap;vertical-align:baseline;border:1px solid #aab2bd;border-radius:4px;padding:0 3px;margin:0 1px;color:#18202a;background:${color};cursor:pointer;${decision === 'change' ? 'text-decoration:line-through;' : ''}`;
        button.addEventListener('click', () => onSelect(finding)); fragment.append(button); cursor = finding.end;
      }
      fragment.append(document.createTextNode(token.value.slice(cursor))); offset = match.index! + match[0].length;
    }
    fragment.append(document.createTextNode(text.data.slice(offset))); text.replaceWith(fragment);
  }
  return root;
};
