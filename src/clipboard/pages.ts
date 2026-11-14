import { clipboardReferenceHtml } from '../adapters/document-clipboard-html';
import { documentHtmlAdapter } from '../adapters/document-html';
import type { SemanticDocument } from '../core/semantic-document';
import { mathText, readMath } from '../core/math';

// Pages does not import HTML MathML as native equations. Rasterize only the
// formulas, locally; the surrounding text and tables remain editable HTML.
export const mathToImage = async (math: Element): Promise<HTMLImageElement> => {
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'closed' });
  const measure = document.createElement('div');
  measure.style.cssText = 'all:initial;display:inline-block;font:16px serif;color:#000;padding:2px;';
  const copy = math.cloneNode(true) as Element;
  copy.querySelectorAll('annotation').forEach(node => node.remove());
  copy.setAttribute('display', 'inline');
  measure.append(copy); shadow.append(measure); document.body.append(host);
  try {
    const rect = measure.getBoundingClientRect();
    const width = Math.ceil(rect.width); const height = Math.ceil(rect.height);
    if (!width || !height || width > 2048 || height > 2048) throw new Error('Formula image size exceeds limit');
    const content = `<div xmlns="http://www.w3.org/1999/xhtml" style="font:16px serif;color:#000;padding:2px;display:inline-block">${new XMLSerializer().serializeToString(copy)}</div>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${content}</foreignObject></svg>`;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    // Pages' HTML paste uses intrinsic PNG pixels as 72 dpi points and ignores
    // HTML/CSS dimensions. Convert CSS 96 dpi pixels to native points here.
    const scale = 72 / 96;
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.scale(scale, scale); context.drawImage(image, 0, 0, width, height);
    const result = document.createElement('img');
    result.src = canvas.toDataURL('image/png'); result.width = canvas.width; result.height = canvas.height;
    const source = readMath(math);
    result.alt = source ? mathText(source) : '公式';
    result.style.cssText = `vertical-align:middle;width:${canvas.width}px;height:${canvas.height}px`;
    return result;
  } finally { host.remove(); }
};

export const pagesHtml = async (document: SemanticDocument, image = mathToImage): Promise<{ value: string; warnings: readonly string[] }> => {
  const rendered = documentHtmlAdapter.render(document);
  const container = globalThis.document.createElement('div'); container.innerHTML = clipboardReferenceHtml(rendered.value);
  const formulas = [...container.querySelectorAll('math')];
  const warnings = rendered.warnings.map(warning => warning.message);
  for (const [index, math] of formulas.entries()) {
    try {
      if (index >= 100) throw new Error('Too many formula images');
      math.replaceWith(await image(math));
    } catch {
      const source = readMath(math);
      math.replaceWith(globalThis.document.createTextNode(source ? mathText(source) : math.textContent ?? '公式'));
      warnings.push('部分公式图片生成失败，已保留原式。');
    }
  }
  if (formulas.length) warnings.unshift('Pages 公式以图片保留，正文和表格可编辑；公式图片不可直接编辑。');
  return { value: container.innerHTML, warnings: [...new Set(warnings)] };
};
