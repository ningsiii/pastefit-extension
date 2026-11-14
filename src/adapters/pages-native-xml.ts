import type { BlockNode, InlineNode, SemanticDocument } from '../core/semantic-document';
import { mathText, renderMath } from '../core/math';
import { escapeHtml as xml } from './document-html';

const mathRun = (text: string, variant?: string): string => `<m:r>${variant ? `<m:rPr><m:sty m:val="${({ normal: 'p', italic: 'i', bold: 'b', 'bold-italic': 'bi' } as Record<string, string>)[variant]}"/></m:rPr>` : ''}<m:t xml:space="preserve">${xml(text)}</m:t></m:r>`;
export const mathmlToOmml = (source: string): string => {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'math') throw new Error('公式格式无效');
  let count = 0;
  const convert = (el: Element, depth = 0, inheritedVariant?: string): string => {
    const variant = el.getAttribute('mathvariant') ?? inheritedVariant;
    if (variant && !['normal', 'italic', 'bold', 'bold-italic'].includes(variant)) throw new Error(`此公式字体暂不支持原生复制：${variant}`);
    if (++count > 4000 || depth > 60) throw new Error('公式过于复杂，请分段复制');
    const children = [...el.children]; const all = () => children.map(c => convert(c, depth + 1, variant)).join('');
    const part = (index: number, tag: string) => { if (!children[index]) throw new Error('公式结构不完整'); return `<m:${tag}>${convert(children[index], depth + 1, variant)}</m:${tag}>`; };
    switch (el.localName) {
      case 'math': case 'mrow': case 'mstyle': case 'mtd': {
        const first = children[0]; const last = children.at(-1);
        if (children.length >= 3 && first.localName === 'mo' && last?.localName === 'mo' && children.some(c => c.localName === 'mtable') && ['()', '[]', '{}', '||', '‖‖'].includes((first.textContent ?? '') + (last.textContent ?? ''))) {
          return `<m:d><m:dPr><m:begChr m:val="${xml(first.textContent ?? '')}"/><m:endChr m:val="${xml(last.textContent ?? '')}"/></m:dPr><m:e>${children.slice(1, -1).map(c => convert(c, depth + 1, variant)).join('')}</m:e></m:d>`;
        }
        return all();
      }
      case 'semantics': return children[0] ? convert(children[0], depth + 1, variant) : '';
      case 'annotation': return '';
      case 'mi': case 'mn': case 'mo': case 'mtext': case 'ms': return mathRun(el.textContent ?? '', variant ?? ((['mtext', 'ms'].includes(el.localName) || el.localName === 'mi' && [...(el.textContent ?? '')].length > 1) ? 'normal' : undefined));
      case 'mspace': return mathRun(' ');
      case 'mfrac': return `<m:f>${part(0, 'num')}${part(1, 'den')}</m:f>`;
      case 'msub': return `<m:sSub>${part(0, 'e')}${part(1, 'sub')}</m:sSub>`;
      case 'msup': return `<m:sSup>${part(0, 'e')}${part(1, 'sup')}</m:sSup>`;
      case 'msubsup': return `<m:sSubSup>${part(0, 'e')}${part(1, 'sub')}${part(2, 'sup')}</m:sSubSup>`;
      case 'msqrt': return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${all()}</m:e></m:rad>`;
      case 'mroot': return `<m:rad>${part(1, 'deg')}${part(0, 'e')}</m:rad>`;
      case 'munder': return `<m:limLow>${part(0, 'e')}${part(1, 'lim')}</m:limLow>`;
      case 'mover': return `<m:limUpp>${part(0, 'e')}${part(1, 'lim')}</m:limUpp>`;
      case 'munderover': return `<m:limUpp><m:e><m:limLow>${part(0, 'e')}${part(1, 'lim')}</m:limLow></m:e>${part(2, 'lim')}</m:limUpp>`;
      case 'mfenced': return `<m:d><m:dPr><m:begChr m:val="${xml(el.getAttribute('open') ?? '(')}"/><m:endChr m:val="${xml(el.getAttribute('close') ?? ')')}"/><m:sepChr m:val="${xml(el.getAttribute('separators') ?? ',')}"/></m:dPr>${children.map(c => `<m:e>${convert(c, depth + 1, variant)}</m:e>`).join('')}</m:d>`;
      case 'mtable': {
        if (children.some(row => row.localName !== 'mtr') || children.some(row => [...row.children].some(cell => cell.localName !== 'mtd'))) throw new Error('暂不支持带标号矩阵');
        const columns = children[0]?.children.length ?? 0;
        if (!columns || children.some(row => row.children.length !== columns)) throw new Error('矩阵列数不一致');
        return `<m:m>${children.map(row => `<m:mr>${[...row.children].map(cell => `<m:e>${convert(cell, depth + 1, variant)}</m:e>`).join('')}</m:mr>`).join('')}</m:m>`;
      }
      default: throw new Error(`此公式结构暂不支持原生复制：${el.localName}`);
    }
  };
  return `<m:oMath>${convert(doc.documentElement)}</m:oMath>`;
};

// Internal transfer only. There is intentionally no download/export action.
// Unsupported equations fail before invoking Pages, rather than becoming images.
const buildTransfer = (document: SemanticDocument, preserveUnsupported: boolean): { documentXml: string; equations: number; warnings: string[] } => {
  let equations = 0; let attempted = 0; const warnings: string[] = [];
  const run = (value: string, properties = '', inheritStyle = false): string => `<w:r><w:rPr>${inheritStyle || properties.includes('<w:b') ? '' : '<w:b w:val="0"/>'}${inheritStyle || properties.includes('<w:i') ? '' : '<w:i w:val="0"/>'}${properties}</w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r>`;
  const inline = (nodes: readonly InlineNode[], properties = '', inheritStyle = false): string => nodes.map((node): string => {
    switch (node.type) {
      case 'text': case 'code': return run(node.value, properties, inheritStyle);
      case 'break': return '<w:r><w:br/></w:r>';
      case 'strong': return inline(node.children, properties + '<w:b/>', inheritStyle);
      case 'emphasis': return inline(node.children, properties + '<w:i/>', inheritStyle);
      case 'underline': return inline(node.children, properties + '<w:u w:val="single"/>', inheritStyle);
      case 'delete': return inline(node.children, properties + '<w:strike/>', inheritStyle);
      case 'superscript': case 'subscript': return inline(node.children, properties + `<w:vertAlign w:val="${node.type}"/>`, inheritStyle);
      case 'link': return inline(node.children, properties, inheritStyle);
      case 'image': return run(node.alt || '[图片]', properties);
      case 'math': {
        if (++attempted > 100) throw new Error('单次最多复制100个公式，请分段复制');
        try {
          const result = renderMath(node); if (!result.value) throw new Error('有公式无法转换，尚未复制；请检查源式');
          const equation = mathmlToOmml(result.value); equations++; return equation;
        } catch (error) {
          if (!preserveUnsupported) throw error;
          warnings.push(`公式 ${attempted} 保留原式：${mathText(node)}`);
          return run(mathText(node), properties);
        }
      }
    }
  }).join('');
  const paragraph = (content: string, prefix = '', indent = 0, level?: number): string => `<w:p><w:pPr><w:pStyle w:val="${level ? `Heading${level}` : 'Normal'}"/>${level ? `<w:outlineLvl w:val="${level - 1}"/>` : ''}${indent ? `<w:ind w:left="${indent * 360}"/>` : ''}</w:pPr>${prefix ? run(prefix) : ''}${content}</w:p>`;
  const blocks = (nodes: readonly BlockNode[], indent = 0): string => nodes.map((node): string => {
    switch (node.type) {
      case 'paragraph': return paragraph(inline(node.children), '', indent);
      case 'heading': return paragraph(inline(node.children, '', true), '', indent, node.level);
      case 'codeBlock': return node.value.split('\n').map(line => paragraph(run(line), '', indent)).join('');
      case 'unknown': return paragraph(run(node.value), '', indent);
      case 'thematicBreak': return paragraph(run('────────'));
      case 'quote': return blocks(node.children, indent + 1);
      case 'list': return node.items.map((item, index) => {
        const prefix = `${node.ordered ? `${(node.start ?? 1) + index}.` : '•'} ${item.checked === undefined ? '' : item.checked ? '☑ ' : '☐ '}`;
        return item.children.map((child, n) => n === 0 && child.type === 'paragraph' ? paragraph(inline(child.children), prefix, indent + 1) : blocks([child], indent + 1)).join('');
      }).join('');
      case 'table': {
        const spans = new Map<number, { until: number; width: number }>(); let max = 0;
        const cell = (content: string, width: number, merge = '') => `<w:tc><w:tcPr>${width > 1 ? `<w:gridSpan w:val="${width}"/>` : ''}${merge ? `<w:vMerge w:val="${merge}"/>` : ''}</w:tcPr>${content || '<w:p/>'}${content.endsWith('</w:tbl>') ? '<w:p/>' : ''}</w:tc>`;
        const rows = node.rows.map((row, r) => {
          let column = 0; let cells = '';
          const continuation = () => { const span = spans.get(column); if (!span || span.until <= r) return false; cells += cell('', span.width, 'continue'); column += span.width; return true; };
          row.cells.forEach((value, index) => {
            while (continuation()) { /* continue existing vertical merges */ }
            const meta = row.cellMeta?.[index]; const width = Math.min(1000, Math.max(1, meta?.colSpan ?? 1)); const height = Math.min(1000, Math.max(1, meta?.rowSpan ?? 1));
            if (height > 1) spans.set(column, { until: r + height, width });
            cells += cell(meta?.blocks.length ? blocks(meta.blocks) : paragraph(inline(value)), width, height > 1 ? 'restart' : ''); column += width;
          });
          while (continuation()) { /* trailing merged cells */ }
          max = Math.max(max, column); return `<w:tr>${cells}</w:tr>`;
        }).join('');
        if (max > 1000 || node.rows.length > 1000) throw new Error('表格过大，请分段复制');
        return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="888888"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2400"/>'.repeat(max)}</w:tblGrid>${rows}</w:tbl>`;
      }
    }
  }).join('');
  const body = blocks(document.children);
  if (!equations && !preserveUnsupported) throw new Error('这段内容没有可转换公式，请使用普通智能复制');
  const result = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  if (new TextEncoder().encode(result).length > 3_000_000) throw new Error('内容过大，请分段复制');
  return { documentXml: result, equations, warnings };
};

export const pagesNativeXml = (document: SemanticDocument): string => buildTransfer(document, false).documentXml;
export const pagesNativeTransfer = (document: SemanticDocument): { documentXml: string; equations: number; warnings: string[] } => buildTransfer(document, true);
