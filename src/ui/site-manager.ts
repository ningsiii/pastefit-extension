import { addSite, deleteSite, enableSite, syncSites } from '../extension/site-access';
import { sitePattern, storedSites } from '../extension/site-settings';

export const mountSiteManager = async (root: HTMLElement): Promise<void> => {
  root.innerHTML = '<header><img src="icons/icon48.png" alt="贴妥"><div><h1>网站管理</h1><p>只在你授权并开启的网站显示选区浮条</p></div><small data-version></small></header><form><label for="site-url">添加网站</label><div class="line"><input id="site-url" type="text" placeholder="例如 example.com 或 HTTPS 链接" required><button type="submit">授权并添加</button></div><p class="hint">按域名管理，不含子域名。添加后默认关闭；开启后请刷新网页。仅支持 HTTPS。</p></form><label for="site-search">搜索已添加的网站</label><input id="site-search" type="search" placeholder="输入域名，筛选下方已添加的网站"><p role="status"></p><ul aria-label="网站列表"></ul><p class="hint">关闭保留授权，删除同时撤销授权。不会保存聊天内容、对话路径或查询参数。</p>';
  root.querySelector('[data-version]')!.textContent = `v${chrome.runtime.getManifest().version}`;
  const form = root.querySelector('form')!;
  const input = root.querySelector<HTMLInputElement>('#site-url')!;
  const search = root.querySelector<HTMLInputElement>('#site-search')!;
  const status = root.querySelector('[role="status"]')!;
  const list = root.querySelector('ul')!;
  let entries: { host: string; enabled: boolean; granted: boolean }[] = [];
  let busy = false;
  const render = (): void => {
    list.replaceChildren();
    const shown = entries.filter(entry => entry.host.includes(search.value.trim().toLowerCase()));
    if (!shown.length) { const empty = document.createElement('li'); empty.textContent = entries.length ? '没有匹配的网站' : '尚未添加网站'; list.append(empty); }
    for (const entry of shown) {
      const row = document.createElement('li');
      const label = document.createElement('label');
      const name = document.createElement('span'); name.textContent = entry.host;
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', `${entry.host}浮条`);
      toggle.checked = entry.enabled && entry.granted; toggle.disabled = busy;
      toggle.addEventListener('change', () => { void perform(() => enableSite(entry.host, toggle.checked), '已更新开关；新开启的网站请刷新网页'); });
      label.append(name, toggle);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除'; remove.setAttribute('aria-label', `删除 ${entry.host}`); remove.disabled = busy;
      remove.addEventListener('click', () => { void perform(() => deleteSite(entry.host), '已删除并撤销授权'); });
      row.append(label, remove);
      if (!entry.granted) { const note = document.createElement('small'); note.textContent = '未授权，开启时重新申请'; row.append(note); }
      list.append(row);
    }
  };
  const load = async (): Promise<void> => {
    entries = await Promise.all(storedSites(await chrome.storage.local.get(null)).sort((a, b) => a.host.localeCompare(b.host)).map(async entry => ({
      ...entry, granted: await chrome.permissions.contains({ origins: [sitePattern(entry.host)] })
    })));
    render();
  };
  const perform = async (action: () => Promise<void>, success: string): Promise<void> => {
    if (busy) return;
    busy = true;
    const submit = form.querySelector('button')!; submit.disabled = true;
    // Start the permission request inside the original user gesture, before awaiting.
    try { const work = action(); render(); await work; status.textContent = success; }
    catch (error) { status.textContent = error instanceof Error ? error.message : '操作失败，请重试'; }
    finally {
      busy = false; submit.disabled = false;
      try { await load(); } catch { status.textContent = '读取失败，请重新打开管理页'; list.replaceChildren(); }
    }
  };
  form.addEventListener('submit', event => { event.preventDefault(); void perform(() => addSite(input.value), '已添加，浮条默认关闭（已有网站保留原开关）'); });
  search.addEventListener('input', render);
  try { await syncSites(); await load(); }
  catch { status.textContent = '读取或同步失败，请重新打开管理页'; }
};
