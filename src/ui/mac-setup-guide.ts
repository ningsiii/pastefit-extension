type Guide = 'install' | 'security' | 'accessibility' | 'automation' | 'ready';

// Screenshot-based annotations are bundled locally; unrelated app names are
// covered. The completed guide is the user's supplied, account-free screenshot.
export const setupIllustration = (kind: Guide, caption: string): HTMLElement => {
  const figure = document.createElement('figure'); figure.className = 'setup-guide';
  const image = document.createElement('img'); image.src = chrome.runtime.getURL(`setup/${kind}.png`);
  image.alt = caption; image.loading = 'lazy';
  const enlarge = document.createElement('a'); enlarge.href = image.src; enlarge.target = '_blank'; enlarge.rel = 'noopener'; enlarge.setAttribute('aria-label', `查看大图：${caption}`); enlarge.append(image);
  const note = document.createElement('figcaption'); note.textContent = kind === 'ready'
    ? '设置完成页截图 · 日常仍使用“贴妥智能复制”'
    : kind === 'security'
      ? '截图底图加圈注 · “仍要打开”只在系统拦截后出现，本图已完成确认，未显示该按钮'
      : '截图底图加圈注 · 无关信息已遮挡，系统版本不同可能略有差异';
  note.textContent += ' · 点图可放大';
  figure.append(enlarge, note); return figure;
};

export const setupTroubleshooting = (summary: string, steps: string[]): HTMLDetailsElement => {
  const details = document.createElement('details'); const heading = document.createElement('summary'); heading.textContent = summary;
  const list = document.createElement('ol'); list.className = 'help-steps';
  for (const step of steps) { const item = document.createElement('li'); item.textContent = step; list.append(item); }
  details.append(heading, list); return details;
};
