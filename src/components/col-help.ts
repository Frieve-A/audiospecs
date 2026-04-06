/**
 * Wire up hover/tap tooltips for .col-help icons inside a container element.
 * @param container - element containing .col-help icons
 * @param scrollContainer - optional scrollable wrapper; tooltip dismisses on scroll
 */
export function setupColHelpTooltips(
  container: HTMLElement,
  scrollContainer?: HTMLElement | null,
): void {
  let popup: HTMLDivElement | null = null;
  let activeIcon: HTMLElement | null = null;

  function showPopup(icon: HTMLElement): void {
    const text = icon.dataset.tooltip;
    if (!text) return;
    dismissPopup();
    popup = document.createElement('div');
    popup.className = 'col-help-popup';
    popup.textContent = text;
    document.body.appendChild(popup);
    icon.classList.add('active');
    activeIcon = icon;

    const rect = icon.getBoundingClientRect();
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    let left = rect.left + rect.width / 2 - pw / 2;
    let top = rect.bottom + 6;
    // Keep within viewport
    if (left < 4) left = 4;
    if (left + pw > window.innerWidth - 4) left = window.innerWidth - 4 - pw;
    if (top + ph > window.innerHeight - 4) top = rect.top - ph - 6;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function dismissPopup(): void {
    if (popup) { popup.remove(); popup = null; }
    if (activeIcon) { activeIcon.classList.remove('active'); activeIcon = null; }
  }

  container.querySelectorAll<HTMLElement>('.col-help').forEach((icon) => {
    // Prevent parent click (e.g. th sort) when clicking the help icon
    icon.addEventListener('click', (e) => { e.stopPropagation(); });

    // Desktop: hover
    icon.addEventListener('mouseenter', () => showPopup(icon));
    icon.addEventListener('mouseleave', () => dismissPopup());

    // Mobile: tap to toggle
    icon.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeIcon === icon) {
        dismissPopup();
      } else {
        showPopup(icon);
      }
    }, { passive: false });
  });

  // Dismiss on scroll or tap elsewhere
  scrollContainer?.addEventListener('scroll', () => dismissPopup(), { passive: true });
  document.addEventListener('touchstart', (e) => {
    if (popup && activeIcon && !activeIcon.contains(e.target as Node)) dismissPopup();
  }, { passive: true });
}
