import { afterEach, expect, it, vi } from 'vitest';
const runtimeEvents = { id: 'test', onStartup: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() } };
const settingsEvents = { storage: { local: { get: vi.fn().mockResolvedValue({}) }, onChanged: { addListener: vi.fn() } }, permissions: { onRemoved: { addListener: vi.fn() } } };

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('registers smart copy first with optional chat-only copy and editing', async () => {
  const installed = vi.fn(); const clicked = vi.fn();
  const create = vi.fn(); const executeScript = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('chrome', {
    ...settingsEvents, runtime: { ...runtimeEvents, onInstalled: { addListener: installed } },
    contextMenus: { removeAll: (callback: () => void) => callback(), create, onClicked: { addListener: clicked } },
    scripting: { executeScript, getRegisteredContentScripts: vi.fn().mockResolvedValue([]) }, action: { setBadgeText: vi.fn().mockResolvedValue(undefined) }
  });
  await import('../../src/extension/service-worker');
  for (const [listener] of installed.mock.calls) listener();
  expect(create.mock.calls.map(([menu]) => menu.title)).toEqual(['贴妥智能复制', '贴妥｜仅复制聊天文字', '贴妥编辑…']);
  await clicked.mock.calls[0][0]({ menuItemId: 'pastefit-edit', frameId: 7 }, { id: 42 });
  expect(executeScript.mock.calls[0][0].args).toEqual(['edit']);
  expect(executeScript.mock.calls[1][0]).toEqual({ target: { tabId: 42, frameIds: [7] }, files: ['assets/selection.js'] });
});
it('reports denied injection without pretending clipboard success', async () => {
  const clicked = vi.fn(); const setBadgeText = vi.fn().mockResolvedValue(undefined); const setTitle = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    ...settingsEvents, runtime: { ...runtimeEvents, onInstalled: { addListener: vi.fn() } }, contextMenus: { onClicked: { addListener: clicked } },
    scripting: { executeScript: vi.fn().mockRejectedValue(new Error('cannot access')) }, action: { setBadgeText, setTitle }
  });
  await import('../../src/extension/service-worker');
  await clicked.mock.calls[0][0]({ menuItemId: 'pastefit-smart' }, { id: 42 });
  expect(setBadgeText).toHaveBeenCalledWith({ tabId: 42, text: '!' });
  expect(setTitle).toHaveBeenCalled();
});
