import { t as defaultTranslate } from './i18n.js';

/** Render the fields and label for the selected decision option. */
export function renderDecisionOptions({
  kind,
  mipBox,
  mipList,
  orientationList,
  confirmButton,
  shelf = [],
  orientations = [],
  translate = defaultTranslate,
  createElement = (tag) => document.createElement(tag),
}) {
  if (kind === 'sugerir') {
    if (mipBox) mipBox.hidden = false;
    renderChecklist(mipList, shelf, 'id', createElement);
    renderChecklist(orientationList, orientations, 'nome', createElement);
    if (confirmButton) confirmButton.textContent = translate('decision.confirmarSugerir');
    return;
  }

  if (mipBox) mipBox.hidden = true;
  if (confirmButton) {
    confirmButton.textContent = translate(
      kind === 'vender' ? 'decision.confirmarVender' : 'decision.confirmarEncaminhar',
    );
  }
}

function renderChecklist(box, items, valueKey, createElement) {
  if (!box) return;
  box.innerHTML = '';
  for (const item of items || []) {
    const label = createElement('label');
    label.className = 'check-row';

    const checkbox = createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = valueKey === 'id' ? item.id : item;

    const text = createElement('span');
    text.textContent = item.nome || item;
    label.append(checkbox, text);
    box.appendChild(label);
  }
}
