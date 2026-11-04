import { writeDocument } from '../../clipboard/rich';
import { normalize } from '../../extension/workflow';
import { openRichEditor } from '../../ui/rich-editor';

const marker = 'data-pastefit-button';
const editMarker = 'data-pastefit-edit-button';
const selectorsByHost: Record<string, string> = {
  'chatgpt.com': 'article[data-turn="assistant"], [data-message-author-role="assistant"]',
  'chat.deepseek.com': '.ds-markdown, [class*="ds-markdown"]',
  'www.doubao.com': '[data-testid="message-content"], [class*="markdown"], [class*="answer-content"]'
};

const responseSelector = (): string => selectorsByHost[window.location.hostname] ?? selectorsByHost['chatgpt.com'];

const findResponses = (root: ParentNode = document): Element[] => {
  const selector = responseSelector();
  return selector ? [...root.querySelectorAll(selector)] : [];
};

const extractHtml = (response: Element): string => {
  const clone = response.cloneNode(true) as Element;
  clone.querySelectorAll(`button, [role="button"], [${marker}], script, style, [hidden], [aria-hidden="true"]`).forEach((node) => node.remove());
  return clone.innerHTML;
};

const setFeedback = (button: HTMLButtonElement, value: string): void => {
  button.textContent = value;
  window.setTimeout(() => { button.textContent = '贴妥'; }, 1500);
};

export const mountPasteFit = (root: ParentNode = document): void => {
  for (const response of findResponses(root)) {
    if (response.querySelector(`[${marker}]`)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '贴妥';
    button.setAttribute(marker, 'true');
    button.setAttribute('aria-label', '使用贴妥复制此回答');
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await writeDocument(normalize({ kind: 'html', content: extractHtml(response) }).document);
        setFeedback(button, '已贴妥');
      } catch { setFeedback(button, '复制失败，请用编辑重试'); }
      finally { button.disabled = false; }
    });
    response.append(button);
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = '编辑';
    editButton.setAttribute(editMarker, 'true');
    editButton.setAttribute('aria-label', '编辑并复制此回答');
    editButton.addEventListener('click', () => {
      const value = normalize({ kind: 'html', content: extractHtml(response) }).document;
      if (!value.children.length) {
        setFeedback(editButton, '内容为空');
        return;
      }
      openRichEditor(value);
    });
    response.append(editButton);
  }
};

export const observePasteFit = (): MutationObserver => {
  mountPasteFit();
  const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node instanceof Element) mountPasteFit(node);
  })));
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
};
