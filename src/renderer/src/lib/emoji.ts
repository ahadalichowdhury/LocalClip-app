/**
 * Emoji data for the Emoji tab (from `unicode-emoji-json`), loaded lazily the
 * first time the tab opens so the clipboard view stays fast.
 */

export type Emoji = {
  e: string;
  name: string;
  skin: boolean;
};

export type EmojiGroup = {
  slug: string;
  name: string;
  emojis: Emoji[];
};

type RawGroup = {
  name: string;
  slug: string;
  emojis: {
    emoji: string;
    name: string;
    skin_tone_support: boolean;
    emoji_version: string;
  }[];
};

// Emoji versions macOS 14.4+ can draw; newer ones are kept only if this Mac
// actually renders them (otherwise they'd show as empty boxes).
const SAFE_VERSION = 15.1;

let rendersCache: boolean | null = null;
/** Draws `sample` and checks it came out as a colour glyph (not a tofu box). */
function rendersColourEmoji(sample: string): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.font = '20px "Apple Color Emoji"';
    ctx.textBaseline = 'top';
    ctx.fillText(sample, 0, 0);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (a > 0 && (Math.abs(r - g) > 10 || Math.abs(g - b) > 10)) return true;
    }
  } catch {
    // canvas unavailable (tests) → be conservative
  }
  return false;
}

let loading: Promise<EmojiGroup[]> | null = null;

export function loadEmoji(): Promise<EmojiGroup[]> {
  if (!loading) {
    loading = import('unicode-emoji-json/data-by-group.json').then(mod => {
      const raw = ((mod as { default?: unknown }).default ?? mod) as RawGroup[];
      return raw.map(g => {
        const newer = g.emojis.find(e => Number(e.emoji_version) > SAFE_VERSION);
        if (newer && rendersCache === null) rendersCache = rendersColourEmoji(newer.emoji);
        return {
          slug: g.slug,
          name: g.name,
          emojis: g.emojis
            .filter(e => Number(e.emoji_version) <= SAFE_VERSION || rendersCache)
            .map(e => ({ e: e.emoji, name: e.name, skin: e.skin_tone_support })),
        };
      });
    });
  }
  return loading;
}

/**
 * Every word of the query must start a word of the emoji's name, so "cat"
 * finds 🐈 and 😺 but not 🈸 ("Japanese application button").
 */
export function searchEmoji(groups: EmojiGroup[], query: string): Emoji[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: Emoji[] = [];
  for (const g of groups) {
    for (const e of g.emojis) {
      const nameWords = e.name.toLowerCase().split(/[\s:,“”"'()-]+/);
      if (words.every(w => nameWords.some(n => n.startsWith(w)))) out.push(e);
    }
  }
  // names that start with the query first ("cat" → cat face before bobcat…)
  const q = words.join(' ');
  return out.sort((a, b) => Number(!a.name.startsWith(q)) - Number(!b.name.startsWith(q)));
}

export const SKIN_TONES = [
  { id: 'default', label: 'Default skin tone', mod: '', swatch: '#ffcc4d' },
  { id: 'light', label: 'Light skin tone', mod: '\u{1F3FB}', swatch: '#f7dece' },
  { id: 'medium-light', label: 'Medium-light skin tone', mod: '\u{1F3FC}', swatch: '#f3d2a2' },
  { id: 'medium', label: 'Medium skin tone', mod: '\u{1F3FD}', swatch: '#d5ab88' },
  { id: 'medium-dark', label: 'Medium-dark skin tone', mod: '\u{1F3FE}', swatch: '#af7e57' },
  { id: 'dark', label: 'Dark skin tone', mod: '\u{1F3FF}', swatch: '#7c533e' },
] as const;

export type SkinToneId = (typeof SKIN_TONES)[number]['id'];

/**
 * Apply a skin-tone modifier: it goes right after the first person/hand code
 * point (dropping a variation selector there), which covers single emoji and
 * the common ZWJ sequences like 👩‍💻.
 */
export function withSkinTone(emoji: Emoji, tone: SkinToneId): string {
  const mod = SKIN_TONES.find(t => t.id === tone)?.mod ?? '';
  if (!mod || !emoji.skin) return emoji.e;
  const chars = Array.from(emoji.e);
  const rest = chars.slice(1);
  if (rest[0] === '️') rest.shift();
  return chars[0] + mod + rest.join('');
}

// ------------------------------------------------------------ preferences

const RECENT_KEY = 'lc-emoji-recent';
const TONE_KEY = 'lc-emoji-tone';
const RECENT_MAX = 24;

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecent(emoji: string): string[] {
  const next = [emoji, ...loadRecent().filter(e => e !== emoji)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: recents just won't persist
  }
  return next;
}

export function loadTone(): SkinToneId {
  try {
    const v = localStorage.getItem(TONE_KEY);
    if (SKIN_TONES.some(t => t.id === v)) return v as SkinToneId;
  } catch {
    // ignore
  }
  return 'default';
}

export function saveTone(tone: SkinToneId) {
  try {
    localStorage.setItem(TONE_KEY, tone);
  } catch {
    // ignore
  }
}
