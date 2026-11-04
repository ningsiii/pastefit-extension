import mark from './pastefit-mark.svg?raw';

// Bundled, inspected brand asset. No remote resource or host permission needed.
export const brandImage = (size: number): HTMLImageElement => {
  const image = document.createElement('img');
  image.src = `data:image/svg+xml,${encodeURIComponent(mark)}`;
  image.alt = '贴妥'; image.width = size; image.height = size;
  image.style.cssText = `display:block;flex:none;width:${size}px;height:${size}px;object-fit:contain;`;
  return image;
};
