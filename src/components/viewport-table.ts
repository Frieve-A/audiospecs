/**
 * Makes a scrollable table container fill the viewport height (minus nav & footer)
 * and implements scroll-trapping: when the container is fully visible in the viewport,
 * wheel events scroll the container internally instead of the page.
 *
 * Scroll-down flow:
 *   page scrolls until entire card is visible → table scrolls internally → page scrolls again
 * Scroll-up flow:
 *   page scrolls until entire card is visible (table at bottom) → table scrolls up → page scrolls again
 */
export function setupViewportTable(container: HTMLElement): () => void {
  /* ── Height calculation ── */
  function updateHeight(): void {
    const nav = document.querySelector('nav.main-nav');
    const footer = document.querySelector('.main-footer');
    const navH = nav ? nav.getBoundingClientRect().height : 0;
    const footerH = footer ? (footer as HTMLElement).offsetHeight : 0;

    // Subtract sibling heights within the same .card (e.g. pagination bar)
    const card = container.closest('.card') as HTMLElement | null;
    let siblingsH = 0;
    if (card) {
      for (const child of Array.from(card.children)) {
        if (child !== container && child instanceof HTMLElement) {
          siblingsH += child.offsetHeight;
        }
      }
      const cs = getComputedStyle(card);
      siblingsH += parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    }

    const available = window.innerHeight - navH - footerH - siblingsH;
    container.style.maxHeight = `${Math.max(200, Math.floor(available))}px`;
  }

  updateHeight();
  window.addEventListener('resize', updateHeight);

  // Recalculate once fonts / lazy content settle
  const rafId = requestAnimationFrame(() => updateHeight());

  /* ── Scroll trapping ── */
  function onWheel(e: WheelEvent): void {
    // Ignore primarily-horizontal scrolls
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    // Determine whether the card is fully within the viewport
    const card = (container.closest('.card') as HTMLElement) ?? container;
    const rect = card.getBoundingClientRect();
    const nav = document.querySelector('nav.main-nav');
    const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;

    const topVisible = rect.top >= navBottom - 1;
    const bottomVisible = rect.bottom <= window.innerHeight + 1;
    if (!topVisible || !bottomVisible) return;

    // If the container doesn't actually overflow, let the page scroll
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight <= clientHeight + 1) return;

    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

    // Normalise deltaY depending on deltaMode
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 40;       // lines → px
    else if (e.deltaMode === 2) delta *= window.innerHeight; // pages → px

    if (delta > 0 && !atBottom) {
      e.preventDefault();
      container.scrollTop += delta;
    } else if (delta < 0 && !atTop) {
      e.preventDefault();
      container.scrollTop += delta;
    }
    // at boundary → event falls through to page scroll
  }

  container.addEventListener('wheel', onWheel, { passive: false });

  /* ── Cleanup ── */
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', updateHeight);
    container.removeEventListener('wheel', onWheel);
  };
}
