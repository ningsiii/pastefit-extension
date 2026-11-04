import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sites, settingKey, setSiteEnabled, supportedSite, watchSiteEnabled } from '../../src/extension/site-settings';
import { startToolbarController } from '../../src/extension/toolbar-controller';
import { mountSettingsPanel } from '../../src/ui/settings-panel';

const get = vi.fn(); const set = vi.fn(); const addListener = vi.fn(); const removeListener = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); get.mockResolvedValue({}); set.mockResolvedValue(undefined);
  vi.stubGlobal('chrome', { storage: { local: { get, set }, onChanged: { addListener, removeListener } },
    permissions: { request: vi.fn().mockResolvedValue(true), contains: vi.fn().mockResolvedValue(true) },
    runtime: { getManifest: () => ({ version: '0.1.0' }), sendMessage: vi.fn().mockResolvedValue({ ok: true }), openOptionsPage: vi.fn().mockResolvedValue(undefined) },
    tabs: { query: vi.fn().mockResolvedValue([{ url: 'https://chatgpt.com/c/test' }]) } });
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

it('defaults all sites off, rejects non-boolean settings, and persists only one approved boolean', async () => {
  for (const site of sites) {
    const apply = vi.fn(); const stop = watchSiteEnabled(site.host, apply); await flush();
    expect(apply.mock.calls.every(([value]) => value === false)).toBe(true); stop();
  }
  get.mockResolvedValue({ [settingKey('chatgpt.com')]: 'true' });
  const apply = vi.fn(); const stop = watchSiteEnabled('chatgpt.com', apply); await flush();
  expect(apply).toHaveBeenLastCalledWith(false); stop();
  await setSiteEnabled('chatgpt.com', true);
  expect(set).toHaveBeenCalledWith({ 'pastefit.toolbar.chatgpt.com': true });
  await expect(setSiteEnabled('*.example', true)).rejects.toThrow();
  expect(set).toHaveBeenCalledTimes(1);
});
it('accepts exact HTTPS sites without treating lookalikes as ChatGPT', () => {
  for (const url of ['https://chatgpt.com/c/a', 'https://chat.deepseek.com/a', 'https://www.doubao.com/chat/', 'https://example.com/']) expect(supportedSite(url)).toBeDefined();
  expect(supportedSite('https://chatgpt.com.evil.test/')?.selector).toBe('');
  for (const url of ['http://chatgpt.com/', 'https://user:pass@example.com/', 'chrome://extensions/', 'file:///test', 'bad']) expect(supportedSite(url)).toBeUndefined();
});
it('new changes win over a delayed initial read and cleanup ignores late reads', async () => {
  let resolve!: (value: Record<string, unknown>) => void;
  get.mockImplementation(() => new Promise(r => { resolve = r; }));
  const apply = vi.fn(); const stop = watchSiteEnabled('chatgpt.com', apply);
  addListener.mock.calls[0][0]({ [settingKey('chatgpt.com')]: { newValue: true } }, 'local');
  resolve({}); await flush(); expect(apply).toHaveBeenLastCalledWith(true);
  stop(); expect(removeListener).toHaveBeenCalledWith(addListener.mock.calls[0][0]);
  const late = vi.fn(); const dispose = watchSiteEnabled('chatgpt.com', late); dispose();
  resolve({ [settingKey('chatgpt.com')]: true }); await flush(); expect(late).toHaveBeenCalledTimes(1);
});
it('controller mounts only after opt-in, avoids duplicates, and immediately disposes on disable', async () => {
  vi.stubGlobal('location', { href: 'https://chatgpt.com/c/a' });
  const unmount = vi.fn(); const mount = vi.fn().mockReturnValue(unmount);
  const stop = startToolbarController(mount); await flush(); expect(mount).not.toHaveBeenCalled();
  const change = addListener.mock.calls[0][0];
  change({ [settingKey('chatgpt.com')]: { newValue: true } }, 'sync'); expect(mount).not.toHaveBeenCalled();
  change({ [settingKey('chatgpt.com')]: { newValue: true } }, 'local');
  change({ [settingKey('chatgpt.com')]: { newValue: true } }, 'local'); expect(mount).toHaveBeenCalledTimes(1);
  change({ [settingKey('chatgpt.com')]: {} }, 'local'); expect(unmount).toHaveBeenCalledTimes(1);
  stop();
});
it('restores an enabled preference after page load and fails closed on read errors', async () => {
  vi.stubGlobal('location', { href: 'https://chatgpt.com/c/a' });
  get.mockResolvedValue({ [settingKey('chatgpt.com')]: true });
  const unmount = vi.fn(); const mount = vi.fn().mockReturnValue(unmount);
  const stop = startToolbarController(mount); await flush(); expect(mount).toHaveBeenCalledTimes(1); stop(); expect(unmount).toHaveBeenCalledTimes(1);
  get.mockRejectedValue(new Error('denied')); mount.mockClear();
  const stopFailed = startToolbarController(mount); await flush(); expect(mount).not.toHaveBeenCalled(); stopFailed();
});
it('does not read preferences or mount on unsupported pages', () => {
  vi.stubGlobal('location', { href: 'chrome://extensions/' });
  const mount = vi.fn(); startToolbarController(mount)();
  expect(get).not.toHaveBeenCalled(); expect(addListener).not.toHaveBeenCalled(); expect(mount).not.toHaveBeenCalled();
});
it('popup shows only the current site off and saving a toggle never sends content', async () => {
  await mountSettingsPanel(document.body);
  const toggles = [...document.querySelectorAll<HTMLInputElement>('input')];
  expect(toggles).toHaveLength(1); expect(toggles.every(input => !input.checked)).toBe(true);
  expect(document.body.textContent).toContain('ChatGPT · chatgpt.com');
  toggles[0].checked = true; toggles[0].dispatchEvent(new Event('change')); await flush();
  expect(set).toHaveBeenCalledWith({ 'pastefit.toolbar.chatgpt.com': true });
  expect(document.body.textContent).toContain('浮条已开启'); expect(toggles[0].disabled).toBe(false);
});
it('keeps the popup compact with single-line site labels and no editor or empty status space', async () => {
  await mountSettingsPanel(document.body);
  expect(document.querySelectorAll('section')).toHaveLength(1);
  expect(document.querySelectorAll('label')).toHaveLength(1);
  expect(document.querySelector('label')!.textContent).toBe('在此网站显示浮条');
  expect(document.querySelector('label')!.title).toBe('chatgpt.com');
  expect(document.querySelector('textarea,[contenteditable]')).toBeNull();
  expect(document.querySelector('footer')!.textContent).toBe('v0.1.0');
  document.querySelector<HTMLButtonElement>('.manage')!.click();
  expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="status"]')!.textContent).toBe('');
});
it('popup rolls back failed saves and exposes failed reads without actionable switches', async () => {
  set.mockRejectedValue(new Error('保存失败')); await mountSettingsPanel(document.body);
  const input = document.querySelector('input')!; input.checked = true; input.dispatchEvent(new Event('change')); await flush();
  expect(input.checked).toBe(false); expect(document.body.textContent).toContain('保存失败');
  get.mockRejectedValue(new Error('denied')); await mountSettingsPanel(document.body);
  expect(document.querySelectorAll('input')).toHaveLength(0); expect(document.body.textContent).toContain('设置读取失败');
});
