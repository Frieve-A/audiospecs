/** Show a brief transient message using the shared #share-toast element. */
export function showToast(message: string, durationMs = 2000): void {
  const toast = document.getElementById('share-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), durationMs);
}
