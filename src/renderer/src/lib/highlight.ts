/**
 * Highlighter colours the user can pick in Settings. A fixed set (rather than
 * a free colour picker) so dark text on the highlighted clip always stays
 * readable in both light and dark themes.
 */
export const HIGHLIGHTS = {
  yellow: { label: 'Yellow', hex: '#ffd84d', rgb: '255, 216, 77' },
  green: { label: 'Green', hex: '#9be38d', rgb: '155, 227, 141' },
  blue: { label: 'Blue', hex: '#8ec5ff', rgb: '142, 197, 255' },
  pink: { label: 'Pink', hex: '#ffa3c7', rgb: '255, 163, 199' },
  orange: { label: 'Orange', hex: '#ffb86b', rgb: '255, 184, 107' },
  purple: { label: 'Purple', hex: '#c9b2ff', rgb: '201, 178, 255' },
} as const;

export type HighlightName = keyof typeof HIGHLIGHTS;

export function applyHighlight(name: string | undefined) {
  const h = HIGHLIGHTS[(name as HighlightName) ?? 'yellow'] ?? HIGHLIGHTS.yellow;
  const root = document.documentElement.style;
  root.setProperty('--hl', h.hex);
  root.setProperty('--hl-rgb', h.rgb);
}
