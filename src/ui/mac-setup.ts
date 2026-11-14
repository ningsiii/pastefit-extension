import { setupIllustration, setupTroubleshooting } from './mac-setup-guide';

type SetupOptions = { installerUrl: string; close?: () => void };
type Step = 'intro' | 'install' | 'accessibility' | 'automation' | 'test' | 'ready' | 'pages' | 'error';

// All state is reconstructed from permissions and the native app. There is no
// saved step number that could mistake a clicked button for a granted right.
export const mountMacSetup = (root: HTMLElement, options: SetupOptions): (() => void) => {
  let disposed = false; let busy = false; let step: Step = 'intro'; let lastState: NativeBridgeState | undefined;
  const mac = /Mac/.test(navigator.platform);
  root.replaceChildren();
  const header = document.createElement('header'); const icon = document.createElement('img'); icon.src = chrome.runtime.getURL('icons/icon48.png'); icon.alt = '';
  const identity = document.createElement('div'); const name = document.createElement('strong'); name.textContent = '贴妥'; const tagline = document.createElement('small'); tagline.textContent = 'PasteFit · Fit to paste.'; identity.append(name, tagline); header.append(icon, identity);
  const progress = document.createElement('ol'); progress.setAttribute('aria-label', '设置进度');
  for (const label of ['安装组件', '开启权限', '试用完成']) { const item = document.createElement('li'); item.textContent = label; progress.append(item); }
  const title = document.createElement('h1'); const description = document.createElement('p'); const actions = document.createElement('div');
  const guide = document.createElement('div');
  const recovery = document.createElement('div');
  const installHelp = document.createElement('details'); installHelp.hidden = true;
  const installSummary = document.createElement('summary'); installSummary.textContent = '安装包打不开，或提示“无法验证”？';
  const installHint = document.createElement('p'); installHint.textContent = '确认是刚下载的贴妥测试组件后，在“隐私与安全”主页面向下找到“安全性”，点贴妥旁的“仍要打开”。系统密码或 Touch ID 由你本人确认，再回到这里重新检查。';
  const securityLink = document.createElement('a'); securityLink.href = 'x-apple.systempreferences:com.apple.preference.security?Privacy'; securityLink.textContent = '打开隐私与安全'; installHelp.append(installSummary, installHint, setupIllustration('security', '在隐私与安全主页面下方，找到贴妥旁的“仍要打开”'), securityLink);
  const status = document.createElement('div'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const help = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '这项设置有什么用？';
  const helpText = document.createElement('p'); helpText.textContent = '辅助组件只在复制含公式的内容时运行，让 Pages 接收可编辑公式。可能短暂切换到 Pages；普通复制不需要安装。内容只在本机处理，组件不向你的目标文稿输入内容。';
  const fullGuide = document.createElement('a'); fullGuide.href = chrome.runtime.getURL('mac-setup-help.html'); fullGuide.target = '_blank'; fullGuide.rel = 'noopener'; fullGuide.textContent = '查看完整图文步骤'; help.append(summary, helpText, fullGuide);
  const footer = document.createElement('footer');
  const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = '停用此功能';
  stop.onclick = () => { void run(async () => { const removed = await chrome.permissions.remove({ permissions: ['nativeMessaging'] }); if (!removed) throw new Error('停用未完成，请重试。'); await request('bridge-status'); show('intro'); status.textContent = '已停用，普通复制仍可使用。'; }); };
  footer.append(stop); root.append(header, progress, title, description, actions, status, guide, installHelp, recovery, help, footer);
  const button = (label: string, action: () => void, secondary = false): HTMLButtonElement => { const node = document.createElement('button'); node.type = 'button'; node.textContent = label; if (secondary) node.className = 'secondary'; node.onclick = action; actions.append(node); return node; };
  const request = (command: string): Promise<NativeBridgeReply> => chrome.runtime.sendMessage({ type: 'pastefit:bridge-setup', command });
  const check = async (): Promise<void> => {
    if (!await chrome.permissions.contains({ permissions: ['nativeMessaging'] })) { show('intro'); return; }
    const result = await request('bridge-status'); if (disposed) return;
    if (result.code === 'busy') { status.textContent = '组件正忙，请稍后重新检查。'; return; }
    apply(result);
  };
  const apply = (result: NativeBridgeReply): void => {
    lastState = result.state;
    if (result.state) {
      const state = result.state;
      if (/^0\.[0-2]\./.test(state.version)) {
        show('install'); title.textContent = '更新贴妥辅助组件';
        description.textContent = '新版改进 Pages 的前三级标题样式。打开安装包完成更新后，回到这里检查即可。';
        return;
      }
      if (!state.pagesInstalled) show('pages');
      else if (!state.accessibility) show('accessibility');
      else if (state.automation !== 'granted') show('automation');
      else show(result.ok && result.tested ? 'ready' : 'test');
      if (!result.ok) status.textContent = failure(result.code);
    } else if (result.code === 'connection-permission') show('intro');
    else if (result.code === 'host-unavailable' || result.code === 'update-required' || result.code === 'connection-timeout') {
      show('install');
      if (result.code === 'connection-timeout') {
        title.textContent = '组件还未连接'; description.textContent = '已安装过就不用重复下载。若 macOS 提示“无法验证”，请先按下图完成系统确认。';
        guide.replaceChildren(); installHelp.open = true;
        status.textContent = '组件没有及时回应，尚未确认可用。';
      }
    }
    else { show('error'); status.textContent = failure(result.code); }
  };
  const failure = (code?: string): string => ({
    'focus-changed': '刚才切换了窗口，试用已停止。请重试。',
    'clipboard-changed': '刚才进行了其他复制，试用已停止。请重试。',
    'conversion-timeout': '试用未完成，请重试。',
    'pages-conversion': 'Pages 还没有完成转换。请查看下方“试用没成功？”后重试。',
    'accessibility-permission': '系统权限尚未开启，请完成后返回此页。',
    'automation-permission': '尚未允许控制 Pages，请完成授权后重试。'
  }[code ?? ''] ?? '检查未完成，请重试。');
  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy || disposed) return; busy = true;
    actions.querySelectorAll('button').forEach(node => { node.disabled = true; }); stop.disabled = true; status.textContent = '正在检查…'; root.setAttribute('aria-busy', 'true');
    try { await work(); } catch { if (!disposed) { show('error'); status.textContent = '连接未完成，请重试。'; } }
    finally { busy = false; if (!disposed) { actions.querySelectorAll('button').forEach(node => { node.disabled = false; }); stop.disabled = false; root.removeAttribute('aria-busy'); } }
  };
  const authorize = (command: string): void => { void run(async () => {
    const result = await request(command); if (disposed) return; apply(result);
    if (step === 'accessibility') status.textContent = '在系统设置中开启“贴妥辅助程序”，然后回到此页。';
    if (step === 'automation') status.textContent = '在系统提示中点“允许”；已拒绝过时，请在“自动化”设置中开启 Pages。';
  }); };
  const show = (next: Step): void => {
    if (disposed) return; step = next; actions.replaceChildren(); guide.replaceChildren(); recovery.replaceChildren(); installHelp.hidden = next !== 'install'; installHelp.open = false; status.textContent = '';
    const index = next === 'intro' || next === 'install' ? 0 : next === 'accessibility' || next === 'automation' ? 1 : 2;
    [...progress.children].forEach((node, i) => { if (i === index) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current'); });
    footer.hidden = next === 'intro';
    const copy: Record<Step, [string, string]> = {
      intro: ['让 Pages 中的公式可以编辑', '首次需要安装一个小组件，之后照常复制粘贴。'],
      install: ['安装贴妥辅助组件', '打开下载的安装包，按系统“安装器”提示点“继续”和“安装”。完成后回到此页。'],
      accessibility: ['开启系统权限', '在“设备控制和数据访问”（有些系统叫“辅助功能”）中，开启“贴妥辅助程序”。完成后回到这里，会自动检查。'],
      automation: ['允许控制 Pages', lastState?.automation === 'not-running' ? '打开 Pages 并确认权限。出现系统提示时，请点“允许”。' : '出现系统提示时，请点“允许”。已拒绝过时，会带你到系统设置。'],
      test: ['最后，试一次公式转换', '使用一条固定测试公式，不使用你的文稿。会短暂切换 Pages，并替换剪贴板中的内容。请等待完成。'],
      ready: ['设置完成', '在贴妥的“公式设置”中开启“Pages 可编辑公式”，再智能复制到 Pages。安装和试用不会自动开启。'],
      pages: ['这台 Mac 还没有 Pages', '安装 Pages 后回到此页，再次检查即可。普通复制仍可使用。'],
      error: ['这一步还没有完成', '可以重新检查；已完成的安装和授权不会要求重做。']
    };
    [title.textContent, description.textContent] = copy[next];
    if (next === 'install') guide.append(setupIllustration('install', '在安装器中点“继续”和“安装”，看到“安装成功”后返回 Chrome'));
    if (next === 'accessibility') {
      guide.append(setupIllustration('accessibility', '开启贴妥辅助程序的开关；列表没有时点加号添加'));
      recovery.append(setupTroubleshooting('找不到贴妥，或开关已开仍不行？', [
        '找不到时点“＋”，在文件选择框按 ⌘⇧G，输入 /Applications/贴妥辅助程序.app，再点“打开”。',
        '如果已开启却仍提示未授权，仅选中“贴妥辅助程序”并点“－”移除，再按上一步重新添加、开启。其他应用不用改。',
        '这会重新授予贴妥控制界面的权限，用于临时公式转换；系统密码或 Touch ID 在系统窗口确认。完成后回到这里检查。'
      ]));
    }
    if (next === 'automation') {
      guide.append(setupIllustration('automation', '在隐私与安全的“自动化”中展开贴妥，开启 Pages'));
      recovery.append(setupTroubleshooting('没出现提示，或之前点过拒绝？', ['点上方“允许控制 Pages”；若跳到“自动化”设置，展开贴妥并开启 Pages，再回到这里。', '只需允许贴妥控制 Pages，不必给 Chrome 或终端增加权限。']));
    }
    if (next === 'test') recovery.append(setupTroubleshooting('试用没成功？', ['先看 Pages 是否停在“打开”或模板选择窗口；可以新建一份空白文稿，再回到此页重试。', '试用时等待完成，先不要切换窗口或进行其他复制。试用只转换固定公式，不修改你的已有文稿。', '仍未成功时可以停用此功能，普通智能复制照常使用。']));
    if (next === 'intro') button('开始设置', () => { void run(async () => {
      const granted = await chrome.permissions.request({ permissions: ['nativeMessaging'] });
      if (granted) await check(); else { show('intro'); status.textContent = '尚未允许本地连接，普通复制仍可使用。'; }
    }); });
    else if (next === 'install') {
      if (options.installerUrl) {
        const link = document.createElement('a'); link.className = 'primary'; link.textContent = '下载安装'; link.download = options.installerUrl.split(/[?#]/)[0].endsWith('.dmg') ? 'PasteFitBridge-mac-universal.dmg' : 'PasteFitBridge-mac-universal.pkg';
        link.href = options.installerUrl.startsWith('https://') ? options.installerUrl : chrome.runtime.getURL(options.installerUrl); actions.append(link);
      } else button('本构建未提供安装包', () => undefined).disabled = true;
      button('我已安装，重新检查', () => { void run(check); }, true);
      status.textContent = options.installerUrl ? '本机测试版。安装器可能要求管理员密码；首次打开可能需要系统安全确认。' : '请使用包含安装包的 Mac 测试构建，或配置正式下载地址。';
    } else if (next === 'accessibility') {
      button('打开系统设置', () => authorize('bridge-request-accessibility'));
      button('我已开启，重新检查', () => { void run(check); }, true);
    }
    else if (next === 'automation') button('允许控制 Pages', () => authorize('bridge-request-automation'));
    else if (next === 'test') button('开始试用', () => { void run(async () => { const result = await request('bridge-self-test'); if (!disposed) apply(result); }); });
    else if (next === 'ready') button('完成', () => { (options.close ?? (() => window.close()))(); });
    else button('重新检查', () => { void run(check); });
  };
  if (!mac) {
    progress.hidden = true; footer.hidden = true; help.hidden = true;
    title.textContent = '此功能仅适用于 Mac 上的 Pages'; description.textContent = '普通复制无需安装辅助组件。'; return () => { disposed = true; };
  }
  show('intro'); void run(check);
  const refresh = (): void => { if (!document.hidden && !busy && !disposed) void run(check); };
  window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
  const dispose = (): void => { disposed = true; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  window.addEventListener('pagehide', dispose, { once: true }); root.addEventListener('pastefit:dispose', dispose, { once: true }); return dispose;
};
