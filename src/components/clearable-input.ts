/**
 * Wraps an <input> so it gains a right-edge clear (×) button visible only when
 * the input has a value, and Escape clears the value as well. After clearing,
 * an `input` event is dispatched so existing listeners react normally.
 */
export function attachClearable(
  input: HTMLInputElement,
  onClear?: () => void,
): void {
  const parent = input.parentElement;
  if (!parent || input.dataset.clearableAttached === '1') return;
  input.dataset.clearableAttached = '1';

  const wrap = document.createElement('span');
  wrap.className = 'clearable-input';

  // Move width-related inline styles from the input to the wrapper so layout
  // is preserved, and let the input fill the wrapper.
  const s = input.style;
  if (s.width) { wrap.style.width = s.width; s.width = ''; }
  if (s.minWidth) { wrap.style.minWidth = s.minWidth; s.minWidth = ''; }
  if (s.maxWidth) { wrap.style.maxWidth = s.maxWidth; s.maxWidth = ''; }
  if (s.flex) { wrap.style.flex = s.flex; s.flex = ''; }
  input.style.width = '100%';

  parent.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'clearable-input-btn';
  btn.setAttribute('aria-label', 'Clear');
  btn.tabIndex = -1;
  btn.innerHTML = '&times;';
  wrap.appendChild(btn);

  const update = (): void => {
    btn.hidden = input.value === '';
  };
  update();

  const clear = (): void => {
    if (input.value === '') return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    update();
    input.focus();
    onClear?.();
  };

  // Prevent the button from stealing focus from the input before click fires.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', clear);
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value !== '') {
      e.preventDefault();
      e.stopPropagation();
      clear();
    }
  });
}
