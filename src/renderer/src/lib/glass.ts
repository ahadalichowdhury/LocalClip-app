/**
 * Glass effect for the popup: the native window is transparent with a macOS
 * blur material behind it (see tauri.conf.json `windowEffects`), and the page
 * background lets that through at the opacity the user picks.
 * Only the popup window is transparent; the About window stays opaque.
 */
export const GLASS_MIN = 0;
export const GLASS_MAX = 100;

export function applyGlass(enabled: boolean | undefined, opacity: number | undefined) {
  const root = document.documentElement;
  const isPopup = window.electronAPI?.utils?.getWindowLabel?.() === 'main';
  const on = !!enabled && isPopup;
  const pct = Math.min(GLASS_MAX, Math.max(GLASS_MIN, opacity ?? 70));
  root.classList.toggle('lc-glass', on);
  root.style.setProperty('--glass-a', on ? String(pct / 100) : '1');
}
