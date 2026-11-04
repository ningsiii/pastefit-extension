import { afterEach, expect, it, vi } from 'vitest';
import { inspectPayload, runDiagnostic, sampleHtml, sampleMarkdown, type Payload, type DiagnosticMode } from '../manual/diagnostic-core';

function prepare(mode: DiagnosticMode) {
  vi.stubGlobal('ClipboardItem', class {
    types: string[];
    constructor(private data: Record<string, Blob | Promise<Blob>>) { this.types = Object.keys(data); }
    getType(type: string) { return Promise.resolve(this.data[type]); }
  });
  if (mode === 'selection') {
    const source = document.createElement('section'); source.innerHTML = sampleHtml; document.body.append(source);
    const range = document.createRange(); range.selectNodeContents(source); window.getSelection()!.addRange(range);
  } else {
    const area = document.createElement('textarea'); area.value = sampleMarkdown; document.body.append(area); area.focus(); area.select();
  }
}
afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals(); });

it.each(['baseline', 'markdown', 'selection', 'html-only'] as const)('diagnoses %s without losing table content', async mode => {
  prepare(mode);
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
  let captured: Payload | undefined;
  await runDiagnostic(mode, writer, payload => { captured = payload; });
  expect(writer.write).toHaveBeenCalledTimes(1);
  expect(writer.writeText).not.toHaveBeenCalled();
  expect(captured!.summary).toMatchObject({ completeTable: true, firstParagraph: true, lastParagraph: true, listItems: 2, bold: '原始粗体内容' });
  expect(captured!.types).toEqual(mode === 'html-only' ? ['text/html'] : ['text/html', 'text/plain']);
  expect(captured!.plain.length > 0).toBe(mode !== 'html-only');
});

it('retains generated evidence but reports a denied write as failure', async () => {
  prepare('markdown');
  const writer = { write: vi.fn().mockRejectedValue(new Error('permission denied')), writeText: vi.fn() };
  const observe = vi.fn();
  await expect(runDiagnostic('markdown', writer, observe)).rejects.toThrow('permission denied');
  expect(observe).toHaveBeenCalledOnce();
  expect(writer.writeText).not.toHaveBeenCalled();
});

it('distinguishes plain text and broken HTML tables from complete rich content', () => {
  expect(inspectPayload('', '字段：Name')).toMatchObject({ htmlCharacters: 0, completeTable: false, rows: [] });
  expect(inspectPayload('<table><tr><td>字段内容</td></tr></table>', '')).toMatchObject({ completeTable: false, rows: [['字段内容']] });
  expect(inspectPayload(sampleHtml, '').completeTable).toBe(true);
});

it('does not insert or execute pasted HTML in the live document', () => {
  inspectPayload('<script>document.body.textContent="unsafe"</script><img src="https://example.invalid/tracker"><table><tr><td>x</td></tr></table>', '');
  expect(document.body.textContent).not.toContain('unsafe');
  expect(document.querySelector('img,script,table')).toBeNull();
});
