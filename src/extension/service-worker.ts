import { reconcileSites } from './site-access';

const refreshSites = (): void => { void reconcileSites().catch(() => { /* UI sync requests report errors; never grant permission here. */ }); };
chrome.runtime.onStartup.addListener(refreshSites);
chrome.runtime.onInstalled.addListener(refreshSites);
chrome.permissions.onRemoved.addListener(refreshSites);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(key => key.startsWith('pastefit.toolbar.'))) refreshSites();
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message.type !== 'pastefit:sync-sites') return;
  void reconcileSites().then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});

const menus = [
  { id: 'pastefit-smart', title: '贴妥智能复制', mode: 'smart' },
  { id: 'pastefit-chat', title: '贴妥｜仅复制聊天文字', mode: 'chat' },
  { id: 'pastefit-edit', title: '贴妥编辑…', mode: 'edit' }
] as const;

export {};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const menu of menus) chrome.contextMenus.create({ id: menu.id, title: menu.title, contexts: ['selection'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menu = menus.find((item) => item.id === info.menuItemId);
  if (!menu || tab.id === undefined) return;
  const target = { tabId: tab.id, frameIds: [info.frameId ?? 0] };
  try {
    await chrome.scripting.executeScript({ target, func: (mode: 'chat' | 'smart' | 'edit') => { window.__pastefitAction = mode; }, args: [menu.mode] });
    await chrome.scripting.executeScript({ target, files: ['assets/selection.js'] });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: '贴妥：此页面或子框架不允许操作，请在普通 HTTPS 网页重试' });
  }
});
