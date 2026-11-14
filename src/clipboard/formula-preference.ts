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

// Installation/readiness never implies consent to use the Pages conversion route.
export const pagesFormulaKey = 'pastefit.pagesFormulaCompatible';
export const getPagesFormulaPreference = async (): Promise<boolean> => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return false;
  return (await chrome.storage.local.get(pagesFormulaKey))[pagesFormulaKey] === true;
};
export const setPagesFormulaPreference = async (enabled: boolean): Promise<void> => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) throw new Error('无法保存公式设置');
  await chrome.storage.local.set({ [pagesFormulaKey]: enabled });
};
