import { inspectPayload, runDiagnostic, sampleHtml, sampleMarkdown, type DiagnosticMode, type Payload } from './diagnostic-core';

const area = document.querySelector<HTMLTextAreaElement>('#source')!;
const source = document.querySelector<HTMLElement>('#rendered')!;
const status = document.querySelector<HTMLElement>('#status')!;
const report = document.querySelector<HTMLTextAreaElement>('#report')!;
const pasteBox = document.querySelector<HTMLTextAreaElement>('#paste')!;
const word = document.querySelector<HTMLSelectElement>('#word')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
area.value = sampleMarkdown;
source.innerHTML = sampleHtml; // Fixed synthetic fixture, never clipboard content.
type Run = { mode: DiagnosticMode; time: string; write: string; sent?: Payload; pasted?: { types: string[]; summary: ReturnType<typeof inspectPayload> }; word: string };
const runs: Run[] = [];
let current: Run | undefined;
let busy = false;
function refresh() {
  report.value = JSON.stringify({ diagnosticVersion: '2026-10-25-1', userAgent: navigator.userAgent, runs }, null, 2);
  document.querySelector('#sent')!.textContent = current?.sent
    ? JSON.stringify({ types: current.sent.types, ...current.sent.summary }, null, 2) : '尚未取得写入载荷';
  document.querySelector('#received')!.textContent = current?.pasted
    ? JSON.stringify(current.pasted, null, 2) : '请在上面的接收框按 Ctrl+V';
}
for (const button of buttons) button.addEventListener('click', async () => {
  if (busy) return;
  busy = true; buttons.forEach(b => b.disabled = true);
  const mode = button.dataset.mode as DiagnosticMode;
  current = { mode, time: new Date().toISOString(), write: '进行中', word: '未测试' };
  runs.push(current); const run = current;
  word.value = '未测试'; pasteBox.value = '';
  (document.activeElement as HTMLElement | null)?.blur(); window.getSelection()?.removeAllRanges();
  if (mode !== 'baseline') source.closest('details')!.open = true;
  if (mode === 'selection') {
    const range = document.createRange(); range.selectNodeContents(source); window.getSelection()?.addRange(range);
  } else if (mode !== 'baseline') { area.focus(); area.select(); }
  status.textContent = '正在复制…'; refresh();
  try {
    await runDiagnostic(mode, navigator.clipboard, payload => { run.sent = payload; refresh(); });
    run.write = 'API 写入成功（尚不代表 Word 粘贴成功）';
    status.textContent = '已复制。现在点击接收框按 Ctrl+V，再去 Word 直接按 Ctrl+V；中间不要复制别的东西。';
    pasteBox.focus();
  } catch (error) {
    run.write = `失败：${error instanceof Error ? error.message : String(error)}`;
    status.textContent = run.write + '。请把报告发给我，不要继续粘贴旧剪贴板。';
  } finally { busy = false; buttons.forEach(b => b.disabled = false); refresh(); }
});
pasteBox.addEventListener('paste', event => {
  event.preventDefault();
  if (!current || busy || !event.clipboardData) return;
  const html = event.clipboardData.getData('text/html');
  const plain = event.clipboardData.getData('text/plain');
  current.pasted = { types: [...event.clipboardData.types], summary: inspectPayload(html, plain) };
  pasteBox.value = '已检测粘贴格式；没有改写剪贴板。现在到 Word 按 Ctrl+V。'; refresh();
});
word.addEventListener('change', () => { if (current) { current.word = word.value; refresh(); } });
document.querySelector('#copy-report')!.addEventListener('click', async () => {
  if (busy) return;
  try { await navigator.clipboard.writeText(report.value); status.textContent = '报告已复制。请回到聊天粘贴给我；测试样本已被报告替换。'; }
  catch { status.textContent = '报告复制失败，请选中下方报告手动复制。'; }
});
status.textContent = '诊断页已就绪。先点 A，完成后再点 B。';
buttons.forEach(b => b.disabled = false);
refresh();
