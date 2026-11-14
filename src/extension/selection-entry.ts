import { copyFailureMessage } from '../clipboard/focus-retry';
import { copyNotice } from '../ui/copy-notice';
import { captureSelection } from './capture-selection';
import { normalize } from './workflow';
import { reviewedCopy as writeDocument, CopyCancelled } from '../clipboard/reviewed-copy';
import { openRichEditor } from '../ui/rich-editor';

const mode = window.__pastefitAction ?? 'smart';
delete window.__pastefitAction;
const input = captureSelection();
if (!input) {
  window.alert('贴妥：没有可用选区，请重新选中文字。');
} else {
  const document = normalize(input).document;
  if (mode === 'edit') openRichEditor(document);
  else {
    let copying = false;
    const copy = (): void => {
      if (copying) return; copying = true;
      const busy = copyNotice([], { pending: true });
      void writeDocument(document, mode).then(warnings => { copyNotice(warnings); }).catch((error: unknown) => {
        if (error instanceof CopyCancelled) return;
        copyNotice([], { error: copyFailureMessage(error), onRetry: copy });
      }).finally(() => { copying = false; busy.remove(); });
    };
    copy();
  }
}
