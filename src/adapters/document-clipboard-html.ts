import { documentHtmlAdapter, renderDocumentHtml } from './document-html';
import type { SemanticDocument } from '../core/semantic-document';

// Chrome resolves fragment links against the source page during clipboard writes.
// Keep visible labels/bookmarks instead of importing misleading external jumps.
// This matches only our adapter's generated escaped HTML, never raw input.
export const clipboardReferenceHtml = (html: string): string => html.replace(/<a href="#pf-ref-[a-z0-9-]{1,80}"(?: title="[^"]*")?>([\s\S]*?)<\/a>/g, '<span>$1</span>');

// Clipboard-only Office metadata. Keep the semantic fragment adapter unchanged:
// it is also used in the editor and round-trip normalization. All CSS below is
// fixed, never copied from the source page. No font, size, color or alignment is
// specified, so this does not impose a paper template on the destination.
export const documentClipboardHtml = (document: SemanticDocument, formulaMode: 'mathml' | 'source' = 'mathml'): ReturnType<typeof documentHtmlAdapter.render> => {
  const fragment = renderDocumentHtml(document, formulaMode);
  let value = clipboardReferenceHtml(fragment.value);
  const listRules: string[] = [];
  // WPS Web ignores ol[start] (and li[value]) during HTML import, but honors
  // the Office list definition. Keep native lists rather than inserting fake
  // text numbers. The editor fragment and chat/plain output remain unchanged.
  if (/<ol start="(?!1")[^"]+"/.test(value)) {
    const parsed = new DOMParser().parseFromString(value, 'text/html');
    for (const [index, list] of [...parsed.querySelectorAll('ol')].entries()) {
      const start = Number(list.getAttribute('start') ?? '1');
      if (!Number.isSafeInteger(start) || start === 1) continue;
      let level = 1;
      for (let parent = list.parentElement; parent; parent = parent.parentElement) if (parent.matches('ol,ul')) level++;
      // Office has nine list levels; keep ordinary HTML beyond that boundary.
      if (level > 9) continue;
      const id = `l${index + 1}`;
      const definition = `mso-list:${id} level${level} lfo${index + 1}`;
      for (const item of [...list.children]) if (item.tagName === 'LI') item.setAttribute('style', definition);
      listRules.push(`@list ${id}:level${level}{mso-level-number-format:decimal;mso-level-start-at:${start};mso-level-text:"%${level}.";}`);
    }
    if (listRules.length) value = parsed.body.innerHTML;
  }
  const rendered = { ...fragment, value };
  const headings = /<h[1-6]>/.test(value);
  if (!headings && !listRules.length) return rendered;
  const styles = listRules.join('\n') + (headings ? Array.from({ length: 6 }, (_, i) => {
    const level = i + 1;
    return `h${level}{mso-style-priority:9;mso-style-qformat:yes;mso-outline-level:${level};}`;
  }).join('\n') + '\np.MsoNormal{mso-style-priority:0;}' : '');
  // Without the built-in MsoNormal class, Word imports ordinary paragraphs as
  // Normal (Web). Keep body text in Normal after every heading as well.
  const body = headings ? rendered.value.replace(/<p>/g, '<p class="MsoNormal">') : rendered.value;
  // Word.Document selects Word's HTML importer, which maps h1..h6 to built-in
  // paragraph styles. Naming them "Heading 1" here instead creates a separate
  // custom style in localized Word. Outline metadata alone only changes its
  // navigation hierarchy, leaving the paragraph in Normal. Verified in Mac Word.
  return {
    ...rendered,
    value: `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="ProgId" content="Word.Document"><style>${styles}</style></head><body><!--StartFragment-->${body}<!--EndFragment--></body></html>`
  };
};
