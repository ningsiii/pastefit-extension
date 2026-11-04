export const sites = [
  { host: 'chatgpt.com', name: 'ChatGPT', selector: 'article[data-turn="assistant"], [data-message-author-role="assistant"], [data-markdown-text-style="assistant-message"]' },
  { host: 'chat.deepseek.com', name: 'DeepSeek', selector: '.ds-markdown' },
  { host: 'www.doubao.com', name: '豆包', selector: '[data-testid="message-content"], [class*="markdown"], [class*="answer-content"]' }
] as const;

export const settingKey = (host: string): string => `pastefit.toolbar.${host}`;
export const parseSite = (input: string): string => {
  const text = input.trim();
  if (!text || text.includes('*')) throw new Error('请输入具体的 HTTPS 网站，不支持通配符');
  const url = new URL(text.includes('://') ? text : `https://${text}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^[a-z0-9.-]+$/.test(url.hostname)) throw new Error('仅支持不含账号或自定义端口的 HTTPS 网站');
  const host = url.hostname.replace(/\.$/, '');
  if (!host || host.length > 253 || host.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) throw new Error('网站域名无效');
  return host;
};
export const sitePattern = (host: string): string => {
  if (parseSite(host) !== host) throw new Error('网站域名无效');
  return `https://${host}/*`;
};
export const storedSites = (values: Record<string, unknown>): { host: string; enabled: boolean }[] => Object.entries(values).flatMap(([key, value]) => {
  if (!key.startsWith('pastefit.toolbar.') || typeof value !== 'boolean') return [];
  const host = key.slice('pastefit.toolbar.'.length);
  try { sitePattern(host); return [{ host, enabled: value }]; } catch { return []; }
});
export const supportedSite = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return undefined;
    const host = parseSite(url);
    return sites.find(site => site.host === host) ?? { host, name: host, selector: '' };
  } catch { return undefined; }
};

export const setSiteEnabled = async (host: string, enabled: boolean): Promise<void> => {
  sitePattern(host);
  await chrome.storage.local.set({ [settingKey(host)]: enabled });
};

// Listen before the initial read; a late read must not undo a newer change.
export const watchSiteEnabled = (host: string, apply: (enabled: boolean) => void): (() => void) => {
  const key = settingKey(host); let revision = 0; let stopped = false;
  apply(false);
  const changed = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
    if (area !== 'local' || !Object.prototype.hasOwnProperty.call(changes, key)) return;
    revision++; apply(changes[key].newValue === true);
  };
  chrome.storage.onChanged.addListener(changed);
  const initialRevision = revision;
  void chrome.storage.local.get(key).then(values => {
    if (!stopped && revision === initialRevision) apply(values[key] === true);
  }, () => { if (!stopped && revision === initialRevision) apply(false); });
  return () => { stopped = true; chrome.storage.onChanged.removeListener(changed); };
};
