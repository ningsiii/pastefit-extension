// Shared brand treatment for copy actions; icons never enter copied content.
export const copyBlue = 'linear-gradient(115deg,#ffffff30 0%,#bad8fb18 40%,#e5e6ee88 100%),linear-gradient(145deg,#5cdffee6 0%,#18b9f8e6 28%,#036ffbe6 67%,#0341eee6 100%)';

export const copyCheck = (): SVGSVGElement => {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16'); icon.setAttribute('aria-hidden', 'true');
  icon.style.cssText = 'width:14px;height:14px;flex:0 0 14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:square;stroke-linejoin:miter';
  const path = document.createElementNS(icon.namespaceURI, 'path'); path.setAttribute('d', 'M3 8l3 3 7-7');
  icon.append(path); return icon;
};

export const confirmCopy = (button: HTMLButtonElement): void => {
  const label = document.createElement('span'); label.textContent = '已复制';
  button.replaceChildren(copyCheck(), label);
};
