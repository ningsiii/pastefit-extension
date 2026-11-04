import { parseSite, settingKey, setSiteEnabled, sitePattern, storedSites } from './site-settings';

export const syncSites = async (): Promise<void> => {
  const result = await chrome.runtime.sendMessage({ type: 'pastefit:sync-sites' });
  if (!result?.ok) throw new Error('网站设置未生效，请重新打开管理页重试');
};

// Called directly from a click/change handler: request before any async read.
export const addSite = async (input: string): Promise<void> => {
  const host = parseSite(input);
  if (!await chrome.permissions.request({ origins: [sitePattern(host)] })) throw new Error('未获授权，未添加网站');
  const values = await chrome.storage.local.get(settingKey(host));
  if (typeof values[settingKey(host)] !== 'boolean') await setSiteEnabled(host, false);
  await syncSites();
};
export const enableSite = async (host: string, enabled: boolean): Promise<void> => {
  const pattern = sitePattern(host);
  if (enabled && !await chrome.permissions.request({ origins: [pattern] })) throw new Error('未获授权，浮条保持关闭');
  await setSiteEnabled(host, enabled);
  try { await syncSites(); }
  catch (error) { if (enabled) await setSiteEnabled(host, false); throw error; }
};
export const deleteSite = async (host: string): Promise<void> => {
  const pattern = sitePattern(host);
  await setSiteEnabled(host, false);
  await syncSites();
  await chrome.permissions.remove({ origins: [pattern] });
  if (await chrome.permissions.contains({ origins: [pattern] })) throw new Error('已关闭，但授权仍存在；请在 Chrome 扩展设置中移除后重试');
  await chrome.storage.local.remove(settingKey(host));
};

// Serial reconciliation avoids duplicate registrations during rapid toggles.
let pending: Promise<void> = Promise.resolve();
export const reconcileSites = (): Promise<void> => {
  const run = async (): Promise<void> => {
    const entries = storedSites(await chrome.storage.local.get(null));
    const wanted = new Map<string, string>();
    for (const { host, enabled } of entries) {
      if (!enabled) continue;
      const pattern = sitePattern(host);
      if (await chrome.permissions.contains({ origins: [pattern] })) wanted.set(`pastefit-site-${host}`, pattern);
      else await setSiteEnabled(host, false);
    }
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const obsolete = registered.filter(script => script.id.startsWith('pastefit-site-') &&
      (!wanted.has(script.id) || script.matches?.join() !== wanted.get(script.id)));
    if (obsolete.length) await chrome.scripting.unregisterContentScripts({ ids: obsolete.map(script => script.id) });
    const existing = new Set(registered.filter(script => !obsolete.includes(script)).map(script => script.id));
    const added = [...wanted].filter(([id]) => !existing.has(id)).map(([id, pattern]) => ({
      id, matches: [pattern], js: ['assets/content.js'], runAt: 'document_idle' as const, persistAcrossSessions: true
    }));
    if (added.length) await chrome.scripting.registerContentScripts(added);
  };
  pending = pending.catch(() => undefined).then(run);
  return pending;
};
