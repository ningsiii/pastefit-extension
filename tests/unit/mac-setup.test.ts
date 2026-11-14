import { afterEach, expect, it, vi } from 'vitest';
import { mountMacSetup } from '../../src/ui/mac-setup';
import { nativeReady, nativeSetupRequest } from '../../src/extension/pages-native-service';
const wire = (send: ReturnType<typeof vi.fn>) => () => {
  let receive: (value: NativeBridgeReply) => void; let disconnected = false;
  return { onMessage: { addListener: (fn: typeof receive) => { receive = fn; } }, onDisconnect: { addListener: vi.fn() }, disconnect: vi.fn(() => { disconnected = true; }), postMessage: (message: { type: string }) => { void send('com.pastefit.pages_bridge', message).then((result: NativeBridgeReply) => { if (!disconnected) receive(result); }); } };
};
const healthy: NativeBridgeState = { protocol: 2, version: '0.3.0', accessibility: true, automation: 'granted', pagesInstalled: true };
const setup = (platform = 'MacIntel') => {
  vi.stubGlobal('navigator', { platform });
  const permission = { value: false };
  const contains = vi.fn(async () => permission.value);
  const request = vi.fn(async () => { permission.value = true; return true; });
  const sendMessage = vi.fn().mockResolvedValue({ ok: false, code: 'host-unavailable' });
  const remove = vi.fn(async () => { permission.value = false; return true; });
  const state: Record<string, boolean> = {};
  const set = vi.fn(async next => Object.assign(state, next));
  const sendNativeMessage = vi.fn().mockResolvedValue({ ok: true, state: healthy });
  const connectNative = vi.fn(wire(sendNativeMessage));
  vi.stubGlobal('chrome', { permissions: { contains, request, remove }, runtime: { getURL: (path: string) => `chrome-extension://test/${path}`, sendMessage, sendNativeMessage, connectNative }, storage: { local: { get: vi.fn(async () => state), set } } });
  const root = document.createElement('main'); document.body.append(root);
  return { root, permission, contains, request, sendMessage, remove, state, set, sendNativeMessage, connectNative };
};
const click = (label: string) => [...document.querySelectorAll('button')].find(node => node.textContent === label)!.click();
afterEach(() => { document.querySelector('main')?.dispatchEvent(new Event('pastefit:dispose')); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('does not display installation controls or query native permissions on non-Mac', async () => {
  const { root, contains, sendMessage } = setup('Win32'); mountMacSetup(root, { installerUrl: 'installers/helper.dmg' });
  expect(root.textContent).toContain('仅适用于 Mac'); expect(root.querySelector('a.primary')).toBeNull(); expect(root.querySelector('button:not(footer button)')).toBeNull(); expect(contains).not.toHaveBeenCalled(); expect(sendMessage).not.toHaveBeenCalled();
});
it('walks a new user through connection, install, returned-focus detection, permissions and a real-test result', async () => {
  const { root, sendMessage } = setup(); const close = vi.fn(); mountMacSetup(root, { installerUrl: 'installers/helper.dmg', close });
  await vi.waitFor(() => expect(root.getAttribute('aria-busy')).toBeNull());
  expect(root.querySelector('h1')!.textContent).toContain('公式可以编辑'); click('开始设置');
  await vi.waitFor(() => expect(root.querySelector('a.primary')!.textContent).toBe('下载安装'));
  expect(root.querySelector('a.primary')!.getAttribute('href')).toBe('chrome-extension://test/installers/helper.dmg');
  expect([...root.querySelectorAll('details')].find(d => d.textContent?.includes('安装包打不开'))!.hidden).toBe(false);
  expect(root.textContent).toContain('仍要打开');
  sendMessage.mockResolvedValue({ ok: true, state: { ...healthy, accessibility: false }, tested: false });
  window.dispatchEvent(new Event('focus')); await vi.waitFor(() => expect(root.querySelector('h1')!.textContent).toBe('开启系统权限'));
  click('打开系统设置'); await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'pastefit:bridge-setup', command: 'bridge-request-accessibility' }));
  await vi.waitFor(() => expect(root.getAttribute('aria-busy')).toBeNull());
  sendMessage.mockResolvedValue({ ok: true, state: { ...healthy, automation: 'required' }, tested: false });
  window.dispatchEvent(new Event('focus')); await vi.waitFor(() => expect(root.querySelector('h1')!.textContent).toBe('允许控制 Pages'));
  sendMessage.mockResolvedValue({ ok: true, state: healthy, tested: false }); click('允许控制 Pages');
  await vi.waitFor(() => expect(root.querySelector('h1')!.textContent).toBe('最后，试一次公式转换'));
  expect(root.textContent).toContain('替换剪贴板'); expect(root.textContent).not.toContain('设置完成');
  sendMessage.mockResolvedValue({ ok: true, state: healthy, tested: true }); click('开始试用');
  await vi.waitFor(() => expect(root.querySelector('h1')!.textContent).toBe('设置完成'));
  expect(sendMessage).toHaveBeenCalledWith({ type: 'pastefit:bridge-setup', command: 'bridge-self-test' }); click('完成'); expect(close).toHaveBeenCalledOnce();
  const guide = root.querySelector('a[href$="mac-setup-help.html"]') as HTMLAnchorElement;
  expect(guide.textContent).toBe('查看完整图文步骤'); expect(guide.target).toBe('_blank');
  expect(root.querySelector('img[src$="ready.png"]')).toBeNull(); // Do not embed a screenshot of this same completion view in itself.
});
it('resumes ready users, supports disabling, and never offers a fake installer link in ordinary builds', async () => {
  const env = setup(); env.permission.value = true; env.sendMessage.mockResolvedValue({ ok: true, state: healthy, tested: true });
  const dispose = mountMacSetup(env.root, { installerUrl: '' });
  await vi.waitFor(() => expect(env.root.querySelector('h1')!.textContent).toBe('设置完成'));
  expect(env.root.querySelector('a.primary')).toBeNull(); click('停用此功能');
  await vi.waitFor(() => expect(env.root.querySelector('h1')!.textContent).toContain('公式可以编辑'));
  expect(env.remove).toHaveBeenCalledWith({ permissions: ['nativeMessaging'] }); dispose();
  env.permission.value = true; env.sendMessage.mockResolvedValue({ ok: false, code: 'host-unavailable' }); mountMacSetup(env.root, { installerUrl: '' });
  await vi.waitFor(() => expect(env.root.textContent).toContain('本构建未提供安装包')); expect(env.root.querySelector('a.primary')).toBeNull();
});
it('keeps denied connections and failed tests unfinished, with retry and no duplicated native action', async () => {
  const env = setup(); env.request.mockImplementation(async () => false); mountMacSetup(env.root, { installerUrl: '' });
  await vi.waitFor(() => expect(env.root.getAttribute('aria-busy')).toBeNull()); click('开始设置');
  await vi.waitFor(() => expect(env.root.textContent).toContain('尚未允许本地连接')); expect(env.sendMessage).not.toHaveBeenCalled();
  env.permission.value = true; env.sendMessage.mockResolvedValue({ ok: true, state: healthy, tested: false }); window.dispatchEvent(new Event('focus'));
  await vi.waitFor(() => expect(env.root.textContent).toContain('开始试用'));
  let finish!: (result: NativeBridgeReply) => void;
  env.sendMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; })); click('开始试用'); click('开始试用');
  expect([...env.root.querySelectorAll('button')].find(b => b.textContent === '开始试用')!.disabled).toBe(true);
  finish({ ok: false, code: 'focus-changed', state: healthy, tested: false });
  await vi.waitFor(() => expect(env.root.textContent).toContain('刚才切换了窗口')); expect(env.root.querySelector('h1')!.textContent).not.toBe('设置完成');
});
it('requires an actual healthy self-test before persisting readiness, and clears it after revocation', async () => {
  const env = setup(); env.permission.value = true;
  expect(await nativeSetupRequest('bridge-status')).toMatchObject({ ok: true, tested: false }); expect(await nativeReady()).toBe(false);
  env.sendNativeMessage.mockResolvedValue({ ok: true, state: healthy, tested: true });
  expect(await nativeSetupRequest('bridge-self-test')).toMatchObject({ ok: true, tested: true }); expect(await nativeReady()).toBe(true);
  env.sendNativeMessage.mockResolvedValue({ ok: true, state: { ...healthy, accessibility: false } });
  await nativeSetupRequest('bridge-status'); expect(await nativeReady()).toBe(false);
  env.permission.value = false; expect(await nativeSetupRequest('bridge-status')).toMatchObject({ ok: false, code: 'connection-permission' });
});
it('rejects unknown commands and malformed health replies without accepting claimed readiness', async () => {
  const env = setup(); env.permission.value = true;
  expect(await nativeSetupRequest('open-arbitrary-url')).toEqual({ ok: false, code: 'invalid-command' }); expect(env.sendNativeMessage).not.toHaveBeenCalled();
  env.sendNativeMessage.mockResolvedValue({ ok: true, tested: true, state: { protocol: 2 } });
  expect(await nativeSetupRequest('bridge-status')).toMatchObject({ ok: false, code: 'update-required' }); expect(await nativeReady()).toBe(false);
});
it('blocks setup control messages from content-script pages and accepts only the exact setup page', async () => {
  vi.resetModules(); const listener = vi.fn(); const reply = vi.fn(); const contains = vi.fn().mockResolvedValue(true);
  const send = vi.fn().mockResolvedValue({ ok: true, state: healthy });
  vi.stubGlobal('chrome', {
    runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}`, onMessage: { addListener: listener }, onInstalled: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() }, sendNativeMessage: send, connectNative: wire(send) },
    permissions: { contains, onRemoved: { addListener: vi.fn() } }, storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) }, onChanged: { addListener: vi.fn() } }, contextMenus: { onClicked: { addListener: vi.fn() } }
  });
  await import('../../src/extension/service-worker'); const handle = listener.mock.calls[0][0];
  handle({ type: 'pastefit:bridge-setup', command: 'bridge-request-accessibility' }, { id: 'test', url: 'https://example.org/' }, reply);
  expect(reply).toHaveBeenCalledWith({ ok: false, code: 'invalid-sender' }); expect(contains).not.toHaveBeenCalled(); reply.mockClear();
  expect(handle({ type: 'pastefit:bridge-setup', command: 'bridge-status' }, { id: 'test', url: 'chrome-extension://test/pages-native.html' }, reply)).toBe(true);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ok: true, state: healthy, tested: false })));
});

it('disconnects a health request blocked before host startup, then allows retry', async () => {
  vi.useFakeTimers(); const env = setup(); env.permission.value = true; env.sendNativeMessage.mockImplementation(() => new Promise(() => undefined));
  const pending = nativeSetupRequest('bridge-status'); await vi.advanceTimersByTimeAsync(12000);
  expect(await pending).toMatchObject({ ok: false, code: 'connection-timeout' });
  expect(env.connectNative.mock.results[0].value.disconnect).toHaveBeenCalledOnce();
  env.sendNativeMessage.mockResolvedValue({ ok: true, state: healthy });
  expect(await nativeSetupRequest('bridge-status')).toMatchObject({ ok: true, tested: false });
});

it('shows the current local illustration, keeps repairs folded, and rechecks actual permission', async () => {
  const env = setup(); env.permission.value = true;
  env.sendMessage.mockResolvedValue({ ok: true, state: { ...healthy, accessibility: false } });
  mountMacSetup(env.root, { installerUrl: 'installers/helper.pkg' });
  await vi.waitFor(() => expect(env.root.querySelector('h1')!.textContent).toBe('开启系统权限'));
  expect(env.root.querySelector('.setup-guide img')!.getAttribute('src')).toBe('chrome-extension://test/setup/accessibility.png');
  const repair = [...env.root.querySelectorAll('details')].find(d => d.querySelector('summary')?.textContent?.includes('开关已开'))!;
  expect(repair.open).toBe(false); expect(repair.textContent).toContain('/Applications/贴妥辅助程序.app');
  repair.open = true; expect(env.sendMessage).toHaveBeenCalledTimes(1);
  click('我已开启，重新检查');
  await vi.waitFor(() => expect(env.sendMessage).toHaveBeenCalledTimes(2));
  expect(env.root.querySelector('h1')!.textContent).toBe('开启系统权限');
  env.sendMessage.mockResolvedValue({ ok: true, state: { ...healthy, automation: 'required' } });
  click('我已开启，重新检查');
  await vi.waitFor(() => expect(env.root.querySelector('h1')!.textContent).toBe('允许控制 Pages'));
  expect(env.root.querySelector('.setup-guide img')!.getAttribute('src')).toContain('/setup/automation.png');
  expect(env.root.textContent).not.toContain('/Applications/贴妥辅助程序.app');
});

it('opens security guidance on timeout without claiming a detected block or completing setup', async () => {
  const env = setup(); env.permission.value = true;
  env.sendMessage.mockResolvedValue({ ok: false, code: 'connection-timeout' });
  mountMacSetup(env.root, { installerUrl: 'installers/helper.pkg' });
  await vi.waitFor(() => expect(env.root.querySelector('h1')!.textContent).toBe('组件还未连接'));
  const help = [...env.root.querySelectorAll('details')].find(d => d.textContent?.includes('仍要打开'))!;
  expect(help.open).toBe(true); expect(help.hidden).toBe(false);
  expect(help.querySelector('img')!.getAttribute('src')).toContain('/setup/security.png');
  expect(help.textContent).toContain('未显示该按钮');
  expect(env.root.textContent).toContain('若 macOS'); expect(env.root.textContent).not.toContain('设置完成');
  env.sendMessage.mockResolvedValue({ ok: true, state: healthy, tested: false });
  click('我已安装，重新检查');
  await vi.waitFor(() => expect(env.root.querySelector('h1')!.textContent).toBe('最后，试一次公式转换'));
  expect(help.hidden).toBe(true); expect(help.open).toBe(false);
  const retry = [...env.root.querySelectorAll('details')].find(d => d.textContent?.includes('试用没成功'))!;
  expect(retry.open).toBe(false); expect(retry.textContent).toContain('空白文稿');
});

it('offers a component update for an older healthy bridge without pretending heading support is ready', async () => {
  const state = setup(); state.permission.value = true;
  state.sendMessage.mockResolvedValue({ ok: true, state: { ...healthy, version: '0.2.0' }, tested: true });
  mountMacSetup(state.root, { installerUrl: 'installers/helper.pkg' });
  await vi.waitFor(() => expect(state.root.textContent).toContain('更新贴妥辅助组件'));
  expect(state.root.textContent).not.toContain('设置完成');
  expect(state.request).not.toHaveBeenCalled();
});
