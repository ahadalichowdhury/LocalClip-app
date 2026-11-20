import {
  Apple,
  Clock,
  Flag,
  Heart,
  Lightbulb,
  LucideIcon,
  PawPrint,
  Plane,
  Smile,
  Trophy,
  User,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Emoji,
  EmojiGroup,
  SKIN_TONES,
  SkinToneId,
  loadEmoji,
  loadRecent,
  loadTone,
  pushRecent,
  saveTone,
  searchEmoji,
  withSkinTone,
} from '../lib/emoji';

export const EMOJI_COLUMNS = 8;

const GROUP_ICONS: Record<string, LucideIcon> = {
  smileys_emotion: Smile,
  people_body: User,
  animals_nature: PawPrint,
  food_drink: Apple,
  travel_places: Plane,
  activities: Trophy,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

type Section = { id: string; title: string; items: { emoji: Emoji; text: string }[] };

interface EmojiPanelProps {
  query: string;
  /** Keyboard hints shown at the right of the bottom bar */
  hints?: React.ReactNode;
}

/**
 * Emoji tab (like the emoji panel in Windows 11's Win+V). Picking an emoji
 * types it into the app you were in; the clipboard is not touched.
 */
export const EmojiPanel: React.FC<EmojiPanelProps> = ({ query , hints }) => {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [tone, setTone] = useState<SkinToneId>(loadTone);
  const [toneOpen, setToneOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    loadEmoji().then(g => alive && setGroups(g));
    return () => {
      alive = false;
    };
  }, []);

  const byText = useMemo(() => {
    const m = new Map<string, Emoji>();
    groups?.forEach(g => g.emojis.forEach(e => m.set(e.e, e)));
    return m;
  }, [groups]);

  const sections: Section[] = useMemo(() => {
    if (!groups) return [];
    const item = (emoji: Emoji) => ({ emoji, text: withSkinTone(emoji, tone) });
    if (query.trim()) {
      return [{ id: 'results', title: 'Results', items: searchEmoji(groups, query).map(item) }];
    }
    const list: Section[] = [];
    if (recent.length) {
      list.push({
        id: 'recent',
        title: 'Recently used',
        // recents are stored with their skin tone already applied
        items: recent.map(text => ({
          emoji: byText.get(text) ?? { e: text, name: '', skin: false },
          text,
        })),
      });
    }
    groups.forEach(g =>
      list.push({ id: g.slug, title: g.name, items: g.emojis.map(item) })
    );
    return list;
  }, [groups, query, recent, tone, byText]);

  const flat = useMemo(() => sections.flatMap(s => s.items), [sections]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const insert = (text: string) => {
    setRecent(pushRecent(text));
    void window.electronAPI?.clipboard?.insertText?.(text);
  };

  // Grid keyboard navigation (the clipboard view's handler is off on this tab)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('.lc-scrim')) return;
      const max = flat.length - 1;
      const move = (d: number) => {
        e.preventDefault();
        setSelected(s => Math.min(max, Math.max(0, s + d)));
      };
      switch (e.key) {
        case 'ArrowRight':
          return move(1);
        case 'ArrowLeft':
          return move(-1);
        case 'ArrowDown':
          return move(EMOJI_COLUMNS);
        case 'ArrowUp':
          return move(-EMOJI_COLUMNS);
        case 'Enter':
          if (flat[selected]) {
            e.preventDefault();
            insert(flat[selected].text);
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, selected]);

  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - 4;
    const firstItem = sections.find(s => s.id === id)?.items[0];
    const first = firstItem ? flat.indexOf(firstItem) : -1;
    if (first >= 0) setSelected(first);
  };

  const shown = flat[hovered ?? selected];
  const toneInfo = SKIN_TONES.find(t => t.id === tone)!;

  if (!groups) {
    return <div className="lc-empty">Loading emoji…</div>;
  }

  let index = -1;
  return (
    <div className="lc-emoji">
      {!query.trim() && (
        <nav className="lc-emoji-cats" aria-label="Emoji categories">
          {recent.length > 0 && (
            <button type="button" title="Recently used" aria-label="Recently used" onClick={() => jumpTo('recent')}>
              <Clock size={16} />
            </button>
          )}
          {groups.map(g => {
            const Icon = GROUP_ICONS[g.slug] ?? Smile;
            return (
              <button key={g.slug} type="button" title={g.name} aria-label={g.name} onClick={() => jumpTo(g.slug)}>
                <Icon size={16} />
              </button>
            );
          })}
          <span className="lc-spacer" />
          <div className="lc-tone">
            <button
              type="button"
              className="lc-tone-btn"
              aria-label={`Skin tone: ${toneInfo.label}`}
              title="Skin tone"
              aria-expanded={toneOpen}
              onClick={() => setToneOpen(o => !o)}
            >
              <span style={{ background: toneInfo.swatch }} />
            </button>
            {toneOpen && (
              <div className="lc-tone-pop" role="radiogroup" aria-label="Skin tone">
                {SKIN_TONES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={t.id === tone}
                    aria-label={t.label}
                    title={t.label}
                    onClick={() => {
                      setTone(t.id);
                      saveTone(t.id);
                      setToneOpen(false);
                    }}
                  >
                    <span style={{ background: t.swatch }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
      )}

      <div className="lc-emoji-scroll" ref={scrollRef}>
        {flat.length === 0 ? (
          <div className="lc-empty">
            <h2>No emoji found</h2>
            <p>Try another word, like &ldquo;heart&rdquo; or &ldquo;cat&rdquo;.</p>
          </div>
        ) : (
          sections.map(s => (
            <section key={s.id} data-section={s.id}>
              <h3 className="lc-section">{s.title}</h3>
              <div className="lc-emoji-grid" role="listbox" aria-label={s.title}>
                {s.items.map(it => {
                  index += 1;
                  const i = index;
                  return (
                    <button
                      key={`${s.id}-${it.text}`}
                      ref={i === selected ? selectedRef : null}
                      type="button"
                      role="option"
                      aria-selected={i === selected}
                      aria-label={it.emoji.name || it.text}
                      className={i === selected ? 'is-selected' : ''}
                      onClick={() => insert(it.text)}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {it.text}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="lc-emoji-info" aria-live="polite">
        {shown && (
          <>
            <span className="lc-emoji-big">{shown.text}</span>
            <span className="lc-emoji-name">{shown.emoji.name}</span>
          </>
        )}
        {hints}
      </div>
    </div>
  );
};
