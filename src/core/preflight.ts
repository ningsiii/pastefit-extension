import type { BlockNode, InlineNode, SemanticDocument } from './semantic-document';

export type ReviewTarget = 'word' | 'wps' | 'pages' | 'auto';
export type Finding = { id: string; label: string; location: string; context: string; replacement?: string; path: string; start: number; end: number; text?: string; protected?: boolean; suspicious?: boolean };
export type FormulaSource = { source: string; format: 'latex' | 'mathml'; location: string };
export type PreflightReport = { findings: Finding[]; formulas: FormulaSource[]; tables: number; images: number; notes: string[]; omitted: number };
export const targetNames: Record<ReviewTarget, string> = { auto: '通用复制', word: 'Word', wps: 'WPS', pages: 'Pages' };

// Visit only prose text. Code, math sources, image URLs and link destinations
// are never rewritten. In complex cells blocks are authoritative; cells are
// retained as the older adapter fallback.
export const mapDocumentText = (doc: SemanticDocument, change: (value: string, path: string, location: string) => string, inspect?: (node: InlineNode | BlockNode, location: string, path: string) => void): SemanticDocument => {
  const inline = (nodes: readonly InlineNode[], path: string, location: string): InlineNode[] => nodes.map((node, index) => {
    const key = `${path}.i${index}`; inspect?.(node, location, key);
    if (node.type === 'text') return { ...node, value: change(node.value, key, location) };
    if ('children' in node) return { ...node, children: inline(node.children, key, location) };
    return node;
  });
  const blocks = (nodes: readonly BlockNode[], path: string, parent: string): BlockNode[] => nodes.map((node, index) => {
    const key = `${path}.b${index}`; const location = `${parent}${index + 1}段`; inspect?.(node, location, key);
    if (node.type === 'paragraph' || node.type === 'heading') return { ...node, children: inline(node.children, key, location) };
    if (node.type === 'quote') return { ...node, children: blocks(node.children, key, `${location}引用/`) };
    if (node.type === 'list') return { ...node, items: node.items.map((item, n) => ({ ...item, children: blocks(item.children, `${key}.l${n}`, `${location}列表${n + 1}项/`) })) };
    if (node.type === 'table') return { ...node, rows: node.rows.map((row, r) => {
      const cells = row.cells.map((cell, c) => row.cellMeta?.[c]?.blocks.length ? cell : inline(cell, `${key}.r${r}.c${c}`, `${location}表格${r + 1}行${c + 1}列/`));
      const cellMeta = row.cellMeta?.map((meta, c) => ({ ...meta, blocks: blocks(meta.blocks, `${key}.r${r}.c${c}`, `${location}表格${r + 1}行${c + 1}列/`) }));
      // The renderers prefer meta.blocks. Do not duplicate findings by walking
      // the compatibility cell representation a second time.
      return { ...row, cells, ...(cellMeta ? { cellMeta } : {}) };
    }) };
    // Unknown content is preserved verbatim and receives a manual-only note.
    return node;
  });
  return { ...doc, children: blocks(doc.children, 'doc', '正文第') };
};

const special: Record<string, [string, string | undefined]> = {
  '\u00a0': ['不换行空格 U+00A0（替换后可换行）', ' '],
  '\u202f': ['窄不换行空格 U+202F（替换后宽度和换行会变化）', ' '],
  '\u200b': ['零宽空格 U+200B（删除会改变断行机会）', ''],
  '\ufeff': ['零宽不换行字符 U+FEFF', ''],
  '\u00ad': ['软连字符 U+00AD（删除会改变断词）', ''],
  '\u2060': ['单词连接符 U+2060：请确认是否用于防止断行', undefined],
  '\u2009': ['细空格 U+2009：可能用于数学或单位排版', undefined],
  '\u200a': ['发丝空格 U+200A：请核对排版用途', undefined],
  '\u200c': ['零宽非连接符 U+200C：可能是语言必需字符', undefined],
  '\u200d': ['零宽连接符 U+200D：可能是语言或 Emoji 必需字符', undefined]
};
const show = (s: string): string => s.replace(/[\u061c\u00a0\u202f\u2009-\u200b\ufeff\u00ad\u2060\u200c-\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, c => `[U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}]`);

export const isUnexpectedControl = (value: string): boolean => {
  const code = value.charCodeAt(0);
  return value.length === 1 && (code <= 8 || code === 11 || (code >= 14 && code <= 31) || code === 127);
};

// Finite, conservative prose-context rules: these mark doubts, not AI origin.
const suspiciousControl = (char: string, context: string, at: number): boolean => {
  if (isUnexpectedControl(char)) return true;
  else if (/^[\u200b\ufeff]$/.test(char)) {
    const left = context.slice(0, at).replace(/[\u200b\ufeff]+$/u, ''); const right = context.slice(at + 1).replace(/^[\u200b\ufeff]+/u, '');
    const token = context.slice(0, at).split(/\s/u).at(-1) ?? '';
    const textChar = '[\\p{Script=Latin}\\p{Script=Han}\\p{N}._]';
    // Japanese and Southeast Asian word boundaries may deliberately use ZWSP;
    // URLs also commonly insert it as a wrapping opportunity.
    const wordContext = new RegExp(`${textChar}[.,;:!?，。；：！？、）)]{0,2}$`, 'u').test(left) || new RegExp(`^${textChar}`, 'u').test(right);
    return !(char === '\ufeff' && at === 0) && wordContext && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u.test(context) && !/(?:https?:\/\/|www\.)/iu.test(token);
  } else if (/^[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]$/.test(char)) {
    // Preserve bidirectional controls where RTL letters establish a plausible use.
    return /[\p{Script=Latin}\p{Script=Han}]/u.test(context) && !/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}\p{Script=Samaritan}\p{Script=Mandaic}]/u.test(context);
  }
  return false;
};

export const inspectDocument = (doc: SemanticDocument, target: ReviewTarget): PreflightReport => {
  // Keep paragraph context across inline formatting; non-prose objects form boundaries.
  const contexts = new Map<string, string>();
  const offsets = new Map<string, { location: string; start: number }>();
  mapDocumentText(doc, (value, path, location) => {
    const before = contexts.get(location) ?? ''; offsets.set(path, { location, start: before.length });
    contexts.set(location, before + value); return value;
  }, (node, location) => {
    if (['code', 'math', 'image', 'break'].includes(node.type)) contexts.set(location, (contexts.get(location) ?? '') + '\ufffc');
  });
  const report: PreflightReport = { findings: [], formulas: [], tables: 0, images: 0, notes: [], omitted: 0 };
  mapDocumentText(doc, (value, path, location) => {
    const add = (start: number, end: number, label: string, replacement?: string): void => {
      if (report.findings.some(item => item.path === path && start < item.end && end > item.start)) return;
      const pos = offsets.get(path);
      const suspicious = Boolean(pos && suspiciousControl(value.slice(start, end), contexts.get(pos.location) ?? '', pos.start + start));
      if (report.findings.length >= 500) {
        report.omitted++;
        // A long run of harmless spaces must not hide a later anomaly.
        const replace = suspicious ? report.findings.findIndex(item => !item.suspicious) : -1;
        if (replace < 0) return;
        report.findings.splice(replace, 1);
      }
      report.findings.push({ id: `${path}:${start}:${end}`, path, start, end, label, location, text: value.slice(start, end), context: show(value.slice(Math.max(0, start - 16), Math.min(value.length, end + 16))), ...(suspicious ? { suspicious: true } : {}), ...(replacement !== undefined ? { replacement } : {}) });
    };
    for (let i = 0; i < value.length; i++) {
      const char = value[i]; const entry = special[char];
      // Emoji ZWJ sequences are intentional; preserve them without noisy flags.
      if (char === '\u200d' && /\p{Extended_Pictographic}[\ufe0f\p{Emoji_Modifier}]*$/u.test(value.slice(0, i)) && /^\p{Extended_Pictographic}/u.test(value.slice(i + 1))) continue;
      if (entry) {
        add(i, i + 1, entry[0], entry[1]);
        const last = report.findings.at(-1);
        if (last?.path === path && last.start === i && /[0-9]$/.test(value.slice(0, i)) && /^(?:kg|g|mg|cm|mm|km|m|s|ms|Hz|kHz|MHz|GHz|K|°C|mol|L|mL|公斤|千克|克|米|秒)(?=$|[\s，。；、.,;])/u.test(value.slice(i + 1)) && /[\u00a0\u202f\u2009]/.test(char)) last.protected = true;
      }
      else if (isUnexpectedControl(char)) add(i, i + 1, '异常控制字符：请核对', '');
      else if (/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(char)) add(i, i + 1, '文字方向控制字符：多语言内容可能需要，请核对');
    }
    const patterns: [RegExp, string][] = [
      [/ {2,}|\t/g, '连续空格或制表符：核对缩进和对齐'],
      [/[ \u3000]+(?=[，。；：！？、）])/g, '中文标点前有空白：请核对'],
      [/\u3000/g, '全角空格：可能用于中文缩进'],
      [/(?:(?:cite|filecite)[^\n]*?|\bturn\d+(?:search|view|file)\d+\b)/g, '疑似未渲染引用标记：请核对来源后编辑'],
      [/(?:\*\*[^\n]+?\*\*|^#{1,6} |^\s*(?:[-*•]|\d+[.)、])\s)/gm, '疑似字面 Markdown 或手打列表：请核对'],
      [/\[(?:待补充|插入[^\]\n]{0,20}|TODO|citation needed)\]/gi, '待补充占位内容：请人工核对']
    ];
    for (const [pattern, label] of patterns) for (const match of value.matchAll(pattern)) {
      const replacement = label.startsWith('连续空格') ? ' ' : label.startsWith('中文标点') ? '' : label.startsWith('疑似未渲染引用') || label.startsWith('待补充占位') ? '' : undefined;
      add(match.index!, match.index! + match[0].length, label, replacement);
    }
    return value;
  }, (node, location, path) => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      const pieces = (nodes: readonly InlineNode[], parent: string): { value: string; path: string }[] => nodes.flatMap((item, index) => {
        const key = `${parent}.i${index}`;
        return item.type === 'text' ? [{ value: item.value, path: key }] : 'children' in item ? pieces(item.children, key) : [{ value: '\ufffc', path: key }];
      });
      const chunks = pieces(node.children, path);
      for (let i = 1; i < chunks.length; i++) if (/ $/.test(chunks[i - 1].value) && /^ /.test(chunks[i].value)) {
        if (report.findings.length >= 500) { report.omitted++; continue; }
        report.findings.push({ id: `${chunks[i].path}:0:1`, path: chunks[i].path, start: 0, end: 1, text: ' ', label: '格式边界两侧都有空格：请核对是否重复', location, context: chunks[i - 1].value.slice(-16) + '[格式边界]' + chunks[i].value.slice(0, 16) });
      }
    }
    if (node.type === 'math') report.formulas.push({ source: node.source, format: node.format, location });
    if (node.type === 'table') report.tables++;
    if (node.type === 'image') report.images++;
    if (node.type === 'unknown') report.notes.push(`${location}包含未识别结构，已按原文字保留，请人工核对。`);
  });
  if (report.omitted) report.notes.push(`另有 ${report.omitted} 处字符提示未展开；处理当前项目后请再次检查。`);
  report.notes.push('适用于 Pages、Word、WPS。源字体、文字颜色和背景色由现有输出规则过滤；不读取目标文档样式，不保证各版本护眼/深色模式显示一致。');
  report.notes.push('空格显示成小点可能只是编辑标记；本检查不删除普通单空格、数学中点或正常列表符号，也不能判定内容是否由 AI 生成。');
  if (report.formulas.length) report.notes.push(target === 'auto' ? '公式保留源式与 MathML；已启用 Mac 公式增强时，会同时提供 Pages 原生格式。' : target === 'pages'
    ? 'Pages 整段粘贴的公式仍为图片，不可直接编辑。可展开公式源，逐条复制到 Pages「插入→方程」，生成可双击编辑的原生公式。'
    : target === 'wps' ? 'WPS 复制保留完整公式源码；需要可编辑公式时，将单条 LaTeX 源码粘到 WPS「插入→公式」的公式框内转换。仅有 MathML 的公式不能直接用此方法。'
    : 'Word 文稿路径输出 MathML；其他版本仍需分别实测。');
  if (report.tables) report.notes.push('表格已保留结构；列宽、跨页、多级表头和目标模板样式请粘贴后核对。');
  if (report.images) report.notes.push('普通图片目前输出说明或链接，不嵌入图片内容。');
  report.notes.push('只检查已捕获内容；不能发现选区外遗漏，也不验证参考文献真实性、事实或学校格式规范。');
  return report;
};

export const cleanFindings = (doc: SemanticDocument, report: PreflightReport, selected: ReadonlySet<string>): SemanticDocument => mapDocumentText(doc, (value, path) => {
  const fixes = report.findings.filter(item => item.path === path && selected.has(item.id) && item.replacement !== undefined).sort((a, b) => b.start - a.start);
  let result = value;
  for (const fix of fixes) result = result.slice(0, fix.start) + fix.replacement + result.slice(fix.end);
  return result;
});
