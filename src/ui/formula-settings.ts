import { getWpsFormulaPreference, setWpsFormulaPreference, getPagesFormulaPreference, setPagesFormulaPreference, pagesFormulaKey } from '../clipboard/formula-preference';

export const mountFormulaSettings = async (root: HTMLElement, options: { embedded?: boolean; onChange?: (enabled: boolean) => void } = {}): Promise<{ flush: () => Promise<void>; dispose: () => void }> => {
  let saving = Promise.resolve(); let loadError: unknown; const cleanups: (() => void)[] = [];
  const section = document.createElement('details');
  section.className = 'pf-formula-settings';
  section.style.cssText = 'margin:12px 0 0;border-top:1px solid #edf1f7;padding-top:12px;font-size:13px';
  const entry = document.createElement('summary'); entry.textContent = '公式设置'; entry.style.cssText = 'display:flex;align-items:center;justify-content:space-between;min-height:28px;line-height:20px;list-style:none;cursor:pointer';
  if (options.embedded) { section.open = true; entry.hidden = true; entry.style.display = 'none'; section.style.cssText = 'font:13px/1.5 sans-serif'; }
  const row = document.createElement('label'); row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;cursor:pointer';
  const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', 'WPS 公式兼容'); toggle.disabled = true;
  // Scoped styling keeps the existing website switches unchanged.
  const style = document.createElement('style');
  style.textContent = '.pf-formula-settings>summary::-webkit-details-marker{display:none}.pf-formula-settings>summary::after{content:"";display:block;width:7px;height:7px;margin-right:3px;border-top:1.5px solid #7182a0;border-right:1.5px solid #7182a0;transform:rotate(45deg);flex-shrink:0}.pf-formula-settings[open]>summary::after{transform:rotate(135deg)}.pf-formula-settings p{margin:6px 0 0;line-height:1.5;color:#5b6572;font-size:12px}.pf-formula-settings a,.pf-formula-settings a:visited{color:#0966df}.pf-formula-settings [role=status]:empty{display:none} .pf-formula-switch{appearance:none!important;width:38px!important;height:23px!important;border:0!important;border-radius:20px;background:#b9bdc4;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}.pf-formula-switch:checked{background:#34c759}.pf-formula-switch:before{content:"";position:absolute;width:19px;height:19px;left:2px;top:2px;border-radius:50%;background:white;box-shadow:0 1px 3px #0003;transition:transform .15s}.pf-formula-switch:checked:before{transform:translateX(15px)}.pf-formula-switch:focus-visible{outline:2px solid #0966df;outline-offset:3px}.pf-formula-switch:disabled{opacity:.5}';
  toggle.className = 'pf-formula-switch';
  const word = document.createElement('p'); word.textContent = 'Word（Office）默认可直接粘贴可编辑公式。';
  const note = document.createElement('p'); note.style.cssText = 'line-height:1.6;color:#5b6572;margin:8px 0';
  const status = document.createElement('p'); status.setAttribute('role', options.embedded ? 'alert' : 'status'); status.style.color = '#b42318';
  const describe = (): void => { note.textContent = toggle.checked ? '已开启：公式保留源码，需粘到 WPS 公式框中转换。' : '已关闭：使用通用公式格式。WPS 公式粘贴异常时可开启。'; };
  const impact = document.createElement('p'); impact.textContent = /Mac/.test(navigator.platform) ? '粘到 Word 或 Pages 前，请关闭此开关；WPS 开启时优先使用源码。' : '粘到 Word 前，请关闭此开关。';
  row.append(document.createTextNode('WPS 公式兼容'), toggle); section.append(style, entry, word, row, note, impact, status);
  root.append(section);
  if (/Mac/.test(navigator.platform)) {
    const link = document.createElement('a'); link.href = typeof chrome !== 'undefined' ? chrome.runtime?.getURL?.('pages-native.html') ?? 'about:blank' : 'about:blank'; link.target = '_blank'; link.textContent = '设置 Pages 可编辑公式 →';
    if (options.embedded) link.addEventListener('click', event => { event.preventDefault(); void chrome.runtime.sendMessage({ type: 'pastefit:open-pages-native-setup' }).catch(() => { status.textContent = '请刷新网页后重试。'; }); });
    link.style.cssText = 'display:inline-block;margin-top:6px;font-size:12px';
    const pagesRow = document.createElement('label'); pagesRow.style.cssText = row.style.cssText;
    const pagesToggle = document.createElement('input'); pagesToggle.type = 'checkbox'; pagesToggle.className = 'pf-formula-switch'; pagesToggle.setAttribute('role', 'switch'); pagesToggle.setAttribute('aria-label', 'Pages 可编辑公式'); pagesToggle.disabled = true;
    const hint = document.createElement('p');
    const describePages = (): void => { hint.textContent = pagesToggle.checked ? '已开启：复制含公式的内容时会调用 Pages。使用 Word 时请关闭。' : '已关闭：复制不会调用 Pages。使用 Pages 可编辑公式时开启，需先完成辅助程序设置。'; };
    pagesRow.append(document.createTextNode('Pages 可编辑公式'), pagesToggle);
    try { pagesToggle.checked = await getPagesFormulaPreference(); pagesToggle.disabled = false; }
    catch (error) { loadError = error; status.textContent = '设置读取失败，请重新打开。'; }
    describePages();
    pagesToggle.addEventListener('change', () => {
      const enabled = pagesToggle.checked; pagesToggle.disabled = true;
      saving = saving.catch(() => undefined).then(() => setPagesFormulaPreference(enabled)).then(() => { status.textContent = ''; describePages(); }).catch(() => {
        pagesToggle.checked = !enabled; describePages(); status.textContent = '保存失败，请重试。'; throw new Error('设置保存失败，请重试。');
      }).finally(() => { pagesToggle.disabled = false; });
      void saving.catch(() => undefined);
    });
    const pagesChanged = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
      if (area === 'local' && pagesFormulaKey in changes) { pagesToggle.checked = changes[pagesFormulaKey].newValue === true; describePages(); }
    };
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(pagesChanged);
    cleanups.push(() => { if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(pagesChanged); });
    hint.style.cssText = 'border-top:1px solid #edf1f7;padding-top:10px;margin-top:12px';
    section.append(pagesRow, hint, link);
  }
  try { toggle.checked = await getWpsFormulaPreference(); describe(); toggle.disabled = false; options.onChange?.(toggle.checked); }
  catch (error) { loadError = error; status.textContent = '设置读取失败，请重新打开。'; }
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked; toggle.disabled = true;
    saving = saving.catch(() => undefined).then(() => setWpsFormulaPreference(enabled)).then(() => { status.textContent = ''; describe(); options.onChange?.(enabled); }).catch(() => {
      toggle.checked = !enabled; describe(); status.textContent = '保存失败，请重试。';
      throw new Error('设置保存失败，请重试。');
    }).finally(() => { toggle.disabled = false; });
    void saving.catch(() => undefined);
  });
  const changed = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
    if (area !== 'local' || !('pastefit.wpsFormulaCompatible' in changes)) return;
    toggle.checked = changes['pastefit.wpsFormulaCompatible'].newValue === true; describe(); options.onChange?.(toggle.checked);
  };
  if (options.onChange && typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(changed);
  return { flush: async () => { if (loadError) throw new Error('公式设置读取失败，请重新打开编辑器。'); await saving; }, dispose: () => { cleanups.forEach(cleanup => cleanup()); if (options.onChange && typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(changed); } };
};
