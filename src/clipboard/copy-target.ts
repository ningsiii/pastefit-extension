export type CopyTarget = 'office' | 'wps' | 'pages';
export const copyTargetKey = 'pastefit.copyTarget';

export const getCopyTarget = async (): Promise<CopyTarget> => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return 'office';
  // A storage error must not silently switch an established Pages user to
  // MathML: the caller can open the editor and ask them to choose again.
  const values = await chrome.storage.local.get(copyTargetKey);
  return values[copyTargetKey] === 'pages' ? 'pages' : values[copyTargetKey] === 'wps' ? 'wps' : 'office';
};

export const setCopyTarget = async (target: CopyTarget): Promise<void> => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) throw new Error('无法保存粘贴目标');
  await chrome.storage.local.set({ [copyTargetKey]: target });
};
