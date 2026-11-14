import { getWpsFormulaPreference, getPagesFormulaPreference } from './formula-preference';
import { inspectDocument, type ReviewTarget } from '../core/preflight';
import type { SemanticDocument } from '../core/semantic-document';
import { reviewDocument } from '../ui/copy-review';
import { copyPagesNative } from './pages-native';
import { CopyCancelled } from './copy-cancelled';
export { CopyCancelled } from './copy-cancelled';
import { writeDocument, type CopyMode, type RichWriter } from './rich';

export const reviewTarget = async (mode: CopyMode): Promise<ReviewTarget> => {
  const target = mode === 'smart' || mode === 'chat' ? 'auto' : mode === 'pages' ? 'pages' : mode === 'wps' || mode === 'wps-document' ? 'wps' : 'office';
  return target === 'office' ? 'word' : target;
};
export const reviewedCopy = async (doc: SemanticDocument, mode: CopyMode = 'smart', writer?: RichWriter, alreadyReviewed = false, formulaOverride?: boolean): Promise<readonly string[]> => {
  const formulaSource = ['smart', 'document', 'office'].includes(mode) && (formulaOverride ?? await getWpsFormulaPreference());
  const target = await reviewTarget(formulaSource ? 'wps' : mode);
  const report = inspectDocument(doc, target);
  const needsReview = !alreadyReviewed && report.findings.some(finding => finding.suspicious);
  const reviewed = needsReview ? await reviewDocument(doc, target, false, mode === 'chat') : doc;
  if (!reviewed) throw new CopyCancelled();
  // An explicit WPS preference takes precedence over the optional Pages data.
  if (!formulaSource && mode === 'smart' && writer === undefined && /Mac/.test(navigator.platform) && report.formulas.length && await getPagesFormulaPreference()) {
    let enabled: boolean;
    try { enabled = (await chrome.runtime.sendMessage({ type: 'pastefit:native-enabled' })).ok; }
    catch { throw new Error('贴妥已更新，请刷新网页后重试。'); }
    if (!enabled) throw new Error('Pages 公式兼容尚未就绪，请完成设置或关闭 Pages 开关。');
    return copyPagesNative(reviewed, true);
  }
  return writeDocument(reviewed, mode, writer, formulaSource);
};
