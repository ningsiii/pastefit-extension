import { settingKey, supportedSite, storedSites, sitePattern } from '../extension/site-settings';
import { enableSite } from '../extension/site-access';

export const mountSettingsPanel = async (root: HTMLElement): Promise<void> => {
  root.innerHTML = '<header><img src="icons/icon32.png" alt="贴妥 Logo"><h1>贴妥</h1><span>选区浮条</span></header><p data-current aria-label="当前网站">正在读取…</p><section aria-label="当前网站浮条开关"><div data-sites></div></section><button class="manage" type="button">管理网站</button><p class="note">默认关闭 · 右键仍可手动使用</p><p class="status" role="status"></p><footer></footer>';
  const status = root.querySelector('[role="status"]')!;
  const current = root.querySelector('[data-current]')!;
  root.querySelector('footer')!.textContent = `v${chrome.runtime.getManifest().version}`;
  const manage = root.querySelector<HTMLButtonElement>('.manage')!;
  manage.addEventListener('click', () => { void chrome.runtime.openOptionsPage().catch(() => { status.textContent = '管理页打开失败，请重试'; }); });
  let site: ReturnType<typeof supportedSite>;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    site = supportedSite(tab?.url ?? '');
    current.textContent = site ? `${site.name} · ${site.host}` : '当前页面不支持浮条';
  } catch { current.textContent = '当前网站读取失败'; }
  let values: Record<string, unknown>;
  try { values = await chrome.storage.local.get(null); }
  catch { status.textContent = '设置读取失败，请关闭后重新打开。'; return; }
  try {
    const enabled = await Promise.all(storedSites(values).filter(entry => entry.enabled).map(entry => chrome.permissions.contains({ origins: [sitePattern(entry.host)] })));
    manage.textContent = `管理网站（已开启 ${enabled.filter(Boolean).length} 个）`;
  } catch { status.textContent = '授权状态读取失败'; return; }
  if (site) {
    const label = document.createElement('label');
    const host = site.host;
    const text = document.createElement('span'); text.textContent = '在此网站显示浮条';
    label.title = host;
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', `${site.name}选区浮条`);
    try { toggle.checked = values[settingKey(host)] === true && await chrome.permissions.contains({ origins: [sitePattern(host)] }); }
    catch { status.textContent = '授权状态读取失败'; return; }
    toggle.addEventListener('change', () => {
      const enabled = toggle.checked; toggle.disabled = true;
      void enableSite(host, enabled).then(async () => {
        status.textContent = enabled ? '浮条已开启，请刷新网页' : '浮条已关闭';
        const saved = storedSites(await chrome.storage.local.get(null)).filter(entry => entry.enabled);
        manage.textContent = `管理网站（已开启 ${saved.length} 个）`;
      }).catch(error => { toggle.checked = !enabled; status.textContent = error instanceof Error ? error.message : '保存失败，请重试'; }).finally(() => { toggle.disabled = false; });
    });
    label.append(text, toggle); root.querySelector('[data-sites]')!.append(label);
  }
};
