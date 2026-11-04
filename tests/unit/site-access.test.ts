import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addSite, deleteSite, enableSite, reconcileSites } from '../../src/extension/site-access';
import { parseSite, settingKey, sitePattern, storedSites } from '../../src/extension/site-settings';
import { mountSiteManager } from '../../src/ui/site-manager';
import { mountSettingsPanel } from '../../src/ui/settings-panel';

let values: Record<string, unknown>; let grants: Set<string>; let scripts: RegisteredScript[];
const request = vi.fn(); const remove = vi.fn(); const register = vi.fn(); const unregister = vi.fn(); const sendMessage = vi.fn();
beforeEach(() => {
  values = {}; grants = new Set(); scripts = []; vi.clearAllMocks();
  request.mockImplementation(async ({ origins }: { origins: string[] }) => { origins.forEach(origin => grants.add(origin)); return true; });
  remove.mockImplementation(async ({ origins }: { origins: string[] }) => { origins.forEach(origin => grants.delete(origin)); return true; });
  register.mockImplementation(async (next: RegisteredScript[]) => { scripts.push(...next); });
  unregister.mockImplementation(async ({ ids }: { ids: string[] }) => { scripts = scripts.filter(script => !ids.includes(script.id)); });
  sendMessage.mockImplementation(async () => { await reconcileSites(); return { ok: true }; });
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: vi.fn(async () => ({ ...values })), set: vi.fn(async (next: Record<string, boolean>) => { Object.assign(values, next); }),
      remove: vi.fn(async (key: string) => { delete values[key]; })
    } },
    permissions: { request, remove, contains: vi.fn(async ({ origins }: { origins: string[] }) => origins.every(origin => grants.has(origin))) },
    scripting: { getRegisteredContentScripts: vi.fn(async () => [...scripts]), registerContentScripts: register, unregisterContentScripts: unregister },
    runtime: { sendMessage, getManifest: () => ({ version: '0.1.0' }), openOptionsPage: vi.fn().mockResolvedValue(undefined) },
    tabs: { query: vi.fn().mockResolvedValue([{ url: 'https://example.com/chat?private=123' }]) }
  });
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

it('canonicalizes domains and rejects schemes, wildcards, credentials and ports', () => {
  expect(parseSite(' HTTPS://EXAMPLE.COM/chat?secret=x#answer ')).toBe('example.com');
  expect(parseSite('example.com')).toBe('example.com');
  expect(sitePattern('example.com')).toBe('https://example.com/*');
  for (const input of ['', '*', '*.example.com', 'http://example.com', 'file:///a', 'chrome://extensions', 'https://a:b@example.com', 'https://example.com:9000', 'https://-bad.com']) expect(() => parseSite(input)).toThrow();
  expect(storedSites({ 'unrelated': true, 'pastefit.toolbar.*': true, 'pastefit.toolbar.example.com': 'true' })).toEqual([]);
});
it('requests exactly one domain, stores no path, adds disabled, and deduplicates', async () => {
  await addSite('https://example.com/chat?secret=x');
  expect(request).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
  expect(values).toEqual({ 'pastefit.toolbar.example.com': false }); expect(scripts).toEqual([]);
  await enableSite('example.com', true); await addSite('https://example.com/another');
  expect(values).toEqual({ 'pastefit.toolbar.example.com': true }); expect(scripts).toHaveLength(1);
  expect(scripts[0]).toEqual({ id: 'pastefit-site-example.com', matches: ['https://example.com/*'], js: ['assets/content.js'], runAt: 'document_idle', persistAcrossSessions: true });
});
it('denied permission never stores or registers a site', async () => {
  request.mockResolvedValue(false);
  await expect(addSite('example.com')).rejects.toThrow('未获授权');
  await expect(enableSite('example.com', true)).rejects.toThrow('未获授权');
  expect(values).toEqual({}); expect(register).not.toHaveBeenCalled();
});
it('disable unregisters without revoking, delete unregisters and revokes only that site', async () => {
  await enableSite('example.com', true); await enableSite('another.example', true);
  await enableSite('example.com', false);
  expect(scripts.map(script => script.id)).toEqual(['pastefit-site-another.example']);
  expect(grants.has(sitePattern('example.com'))).toBe(true);
  await deleteSite('another.example');
  expect(remove).toHaveBeenCalledWith({ origins: ['https://another.example/*'] });
  expect(values).toEqual({ 'pastefit.toolbar.example.com': false }); expect(scripts).toEqual([]);
});
it('revocation or missing migration permissions fail closed without requesting anything', async () => {
  values[settingKey('chatgpt.com')] = true;
  scripts = [{ id: 'pastefit-site-chatgpt.com', matches: ['https://chatgpt.com/*'] }];
  await reconcileSites();
  expect(values[settingKey('chatgpt.com')]).toBe(false); expect(scripts).toEqual([]); expect(request).not.toHaveBeenCalled();
});
it('serializes rapid reconciliation without duplicate registrations and preserves unrelated scripts', async () => {
  values[settingKey('example.com')] = true; grants.add(sitePattern('example.com'));
  scripts = [{ id: 'unrelated-script', matches: ['https://another.example/*'] }];
  await Promise.all([reconcileSites(), reconcileSites(), reconcileSites()]);
  expect(register).toHaveBeenCalledTimes(1); expect(scripts).toHaveLength(2);
});
it('registration failure rolls enabled preference back to off', async () => {
  sendMessage.mockResolvedValue({ ok: false });
  await expect(enableSite('example.com', true)).rejects.toThrow('未生效');
  expect(values[settingKey('example.com')]).toBe(false);
});
it('failed revocation leaves a disabled manageable entry instead of claiming deletion', async () => {
  await enableSite('example.com', true); remove.mockResolvedValue(false);
  await expect(deleteSite('example.com')).rejects.toThrow('授权仍存在');
  expect(values[settingKey('example.com')]).toBe(false); expect(scripts).toEqual([]);
});
it('background startup, revoke and storage hooks reconcile without granting access', async () => {
  const startup = vi.fn(); const removed = vi.fn(); const changed = vi.fn(); const message = vi.fn();
  Object.assign(chrome.runtime, { id: 'test-extension', onStartup: { addListener: startup }, onInstalled: { addListener: vi.fn() }, onMessage: { addListener: message } });
  Object.assign(chrome.permissions, { onRemoved: { addListener: removed } });
  Object.assign(chrome.storage, { onChanged: { addListener: changed } });
  Object.assign(chrome, { contextMenus: { onClicked: { addListener: vi.fn() } } });
  await import('../../src/extension/service-worker');
  values[settingKey('example.com')] = true; grants.add(sitePattern('example.com'));
  startup.mock.calls[0][0](); await vi.waitFor(() => expect(scripts).toHaveLength(1));
  grants.clear(); removed.mock.calls[0][0]();
  await vi.waitFor(() => expect(values[settingKey('example.com')]).toBe(false));
  await vi.waitFor(() => expect(scripts).toHaveLength(0));
  const reply = vi.fn(); expect(message.mock.calls[0][0]({ type: 'pastefit:sync-sites' }, { id: 'foreign' }, reply)).toBeUndefined();
  expect(reply).not.toHaveBeenCalled();
  expect(message.mock.calls[0][0]({ type: 'pastefit:sync-sites' }, { id: 'test-extension' }, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ ok: true }));
  expect(changed).toHaveBeenCalledTimes(1); expect(request).not.toHaveBeenCalled();
});
it('manager adds disabled sites, searches, toggles and deletes with version visible', async () => {
  await mountSiteManager(document.body);
  expect(document.body.textContent).toContain('v0.1.0');
  const input = document.querySelector<HTMLInputElement>('#site-url')!;
  input.value = 'https://example.com/private'; document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector('ul')!.textContent).toContain('example.com'));
  const toggle = document.querySelector<HTMLInputElement>('[role="switch"]')!; expect(toggle.checked).toBe(false);
  toggle.checked = true; toggle.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(scripts).toHaveLength(1));
  await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('[role="switch"]')!.disabled).toBe(false));
  const search = document.querySelector<HTMLInputElement>('#site-search')!; search.value = 'nothing'; search.dispatchEvent(new Event('input'));
  expect(document.querySelector('ul')!.textContent).toContain('没有匹配');
  search.value = ''; search.dispatchEvent(new Event('input')); document.querySelector<HTMLButtonElement>('ul button')!.click();
  await vi.waitFor(() => expect(document.querySelector('ul')!.textContent).toContain('尚未添加'));
  expect(grants.size).toBe(0);
});
it('popup stays one switch regardless of list size and keeps management accessible on internal pages', async () => {
  for (let i = 0; i < 30; i++) { values[settingKey(`site${i}.example`)] = true; grants.add(sitePattern(`site${i}.example`)); }
  await mountSettingsPanel(document.body);
  expect(document.querySelectorAll('input')).toHaveLength(1); expect(document.body.textContent).toContain('已开启 30 个');
  expect(document.body.textContent).not.toContain('site29.example');
  vi.mocked(chrome.tabs.query).mockResolvedValue([{ url: 'chrome://extensions' }]);
  await mountSettingsPanel(document.body); expect(document.querySelectorAll('input')).toHaveLength(0);
  document.querySelector<HTMLButtonElement>('.manage')!.click(); expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
});
