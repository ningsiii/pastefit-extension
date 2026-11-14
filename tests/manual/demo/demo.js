/* global document, HTMLButtonElement */
const scenes = {
  chat: { tag: '01 / CHAT', title: '告别满屏 Markdown 标记' },
  document: { tag: '02 / DOCUMENT', title: '层次、表格、公式，各就各位' },
  hidden: { tag: '03 / REVIEW', title: '看不见，也能认真检查' },
  edit: { tag: '04 / EDIT', title: '重点突出，消息更好读' },
  get: { tag: '05 / PASTEFIT', title: '获取贴妥' }
};
const sample = document.getElementById('sample');
const show = scene => {
  document.getElementById('scene-tag').textContent = scenes[scene].tag;
  document.getElementById('scene-title').textContent = scenes[scene].title;
  sample.dataset.scene = scene;
  sample.replaceChildren(document.getElementById(`scene-${scene}`).content.cloneNode(true));
  document.querySelectorAll('[data-scene]').forEach(button => {
    if (!(button instanceof HTMLButtonElement)) return;
    const active = button.dataset.scene === scene;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
};
document.querySelectorAll('nav [data-scene]').forEach(button => button.addEventListener('click', () => show(button.dataset.scene)));
show('chat');
