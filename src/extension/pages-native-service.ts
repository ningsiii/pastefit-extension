let active = false;
export const nativePagesRequest = async (xml: unknown, html?: unknown, plain?: unknown): Promise<{ ok: boolean; code?: string }> => {
  if (active) return { ok: false, code: 'busy' };
  if (typeof xml !== 'string' || xml.length > 3_000_000 || !xml.startsWith('<w:document ') || /<!|<\?/.test(xml)) return { ok: false, code: 'invalid-document' };
  if ((html !== undefined || plain !== undefined) && (typeof html !== 'string' || typeof plain !== 'string' || !html || !plain.trim() || html.includes('\0') || plain.includes('\0') || new TextEncoder().encode(html + plain).length > 2_000_000)) return { ok: false, code: 'invalid-representations' };
  const request = { type: 'copy-pages-equations', documentXml: xml, ...(html !== undefined && plain !== undefined ? { html: html as string, plain: plain as string } : {}) };
  if (new TextEncoder().encode(JSON.stringify(request)).length > 4_000_000) return { ok: false, code: 'invalid-document' };
  active = true;
  try {
    if (!await chrome.permissions.contains({ permissions: ['nativeMessaging'] })) return { ok: false, code: 'connection-permission' };
    const result = await chrome.runtime.sendNativeMessage('com.pastefit.pages_bridge', request);
    return result?.ok === true ? { ok: true } : { ok: false, code: typeof result?.code === 'string' ? result.code : 'conversion-failed' };
  } catch { return { ok: false, code: 'host-unavailable' }; }
  finally { active = false; }
};

// A blocked executable may never start, so the host's own timeout cannot
// help. Disconnect the native port on deadline; never leave setup wedged.
const setupRoundTrip = (command: string): Promise<NativeBridgeReply> => new Promise((resolve, reject) => {
  const port = chrome.runtime.connectNative('com.pastefit.pages_bridge'); let settled = false;
  const finish = (result?: NativeBridgeReply, reason?: string): void => {
    if (settled) return; settled = true; clearTimeout(timer); try { port.disconnect(); } catch { /* The host may already have exited. */ }
    if (result) resolve(result); else reject(new Error(reason ?? 'host-unavailable'));
  };
  const timer = setTimeout(() => finish(undefined, 'connection-timeout'), command === 'bridge-status' ? 12000 : 75000);
  port.onMessage.addListener(value => finish(value));
  port.onDisconnect.addListener(() => { const message = chrome.runtime.lastError?.message; finish(undefined, message); });
  try { port.postMessage({ type: command }); } catch { finish(undefined, 'host-unavailable'); }
});
const readyKey = 'pastefit.nativeReady';
const isState = (value: unknown): value is NativeBridgeState => {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return Number.isSafeInteger(state.protocol) && (state.protocol as number) >= 2 && typeof state.version === 'string' && state.version.length < 40 && typeof state.accessibility === 'boolean' && typeof state.pagesInstalled === 'boolean' && ['granted', 'required', 'denied', 'not-running', 'unavailable'].includes(String(state.automation));
};
export const nativeReady = async (): Promise<boolean> => await chrome.permissions.contains({ permissions: ['nativeMessaging'] }) && (await chrome.storage.local.get(readyKey))[readyKey] === true;
export const nativeSetupRequest = async (command: unknown): Promise<NativeBridgeReply> => {
  if (!['bridge-status', 'bridge-request-accessibility', 'bridge-request-automation', 'bridge-self-test'].includes(String(command))) return { ok: false, code: 'invalid-command' };
  if (active) return { ok: false, code: 'busy' };
  active = true;
  try {
    if (!await chrome.permissions.contains({ permissions: ['nativeMessaging'] })) {
      await chrome.storage.local.set({ [readyKey]: false }); return { ok: false, code: 'connection-permission' };
    }
    const result = await setupRoundTrip(command as string);
    if (!isState(result?.state)) { await chrome.storage.local.set({ [readyKey]: false }); return { ok: false, code: result?.code ?? 'update-required' }; }
    const state = result.state;
    if (!state.accessibility || state.automation !== 'granted' || !state.pagesInstalled || (command === 'bridge-self-test' && (!result.ok || result.tested !== true))) await chrome.storage.local.set({ [readyKey]: false });
    else if (command === 'bridge-self-test' && result.ok && result.tested === true) await chrome.storage.local.set({ [readyKey]: true });
    return { ok: result.ok === true, ...(result.code ? { code: result.code } : {}), state, tested: await nativeReady() };
  } catch (error) {
    await chrome.storage.local.set({ [readyKey]: false }); return { ok: false, code: error instanceof Error && error.message === 'connection-timeout' ? 'connection-timeout' : 'host-unavailable' };
  } finally { active = false; }
};
