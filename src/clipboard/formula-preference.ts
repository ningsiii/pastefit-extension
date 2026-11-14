export const wpsFormulaKey = 'pastefit.wpsFormulaCompatible';

export const getWpsFormulaPreference = async (): Promise<boolean> => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return false;
  const values = await chrome.storage.local.get(wpsFormulaKey);
  return values[wpsFormulaKey] === true;
};

export const setWpsFormulaPreference = async (enabled: boolean): Promise<void> => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) throw new Error('无法保存公式设置');
  await chrome.storage.local.set({ [wpsFormulaKey]: enabled });
};
