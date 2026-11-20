import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useScrollFade } from '../hooks/useScrollFade';
import { PickGroup, PickItem, searchPick } from '../lib/symbols';

interface PickerPanelProps {
  /** localStorage key for this tab's recently used items */
  kind: 'symbols' | 'kaomoji';
  groups: PickGroup[];
  query: string;
  /** grid columns (keyboard ↑↓ moves by this many) */
  columns: number;
  /** Keyboard hints shown at the right of the bottom bar */
  hints?: React.ReactNode;
}

const RECENT_MAX = 16;

function loadRecent(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Symbols / Kaomoji tab. Picking an item types it into the app you were in
 * (same as the Emoji tab); the clipboard is not touched.
 */
export const PickerPanel: React.FC<PickerPanelProps> = ({ kind, groups, query, columns , hints }) => {
  const recentKey = `lc-${kind}-recent`;
  const [recent, setRecent] = useState<string[]>(() => loadRecent(recentKey));
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const catsRef = useRef<HTMLElement>(null);
  useScrollFade(catsRef, [kind, query === '']);

  const byText = useMemo(() => {
    const m = new Map<string, PickItem>();
    groups.forEach(g => g.items.forEach(it => m.set(it.text, it)));
    return m;
  }, [groups]);

  const sections = useMemo(() => {
    if (query.trim()) {
      return [{ id: 'results', title: 'Results', items: searchPick(groups, query) }];
    }
    const list: PickGroup[] = [];
    if (recent.length) {
      list.push({
        id: 'recent',
        title: 'Recently used',
        items: recent.map(t => byText.get(t) ?? { text: t, name: '' }),
      });
    }
    return [...list, ...groups];
  }, [groups, query, recent, byText]);

  const flat = useMemo(() => sections.flatMap(s => s.items), [sections]);

  useEffect(() => setSelected(0), [query, kind]);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const insert = (text: string) => {
    const next = [text, ...recent.filter(t => t !== text)].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      // storage unavailable: recents just won't persist
    }
    void window.electronAPI?.clipboard?.insertText?.(text);
  };

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
          return move(columns);
        case 'ArrowUp':
          return move(-columns);
        case 'Enter':
          if (flat[selected]) {
            e.preventDefault();
            insert(flat[selected].text);
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, selected, columns]);

  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - 4;
    const first = sections.find(s => s.id === id)?.items[0];
    if (first) setSelected(flat.indexOf(first));
  };

  const shown = flat[hovered ?? selected];
  let index = -1;

  return (
    <div className={`lc-emoji lc-picker is-${kind}`}>
      {!query.trim() && (
        <nav className="lc-picker-cats" aria-label={`${kind} groups`} ref={catsRef}>
          {sections.map(s => (
            <button key={s.id} type="button" onClick={() => jumpTo(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
      )}

      <div className="lc-emoji-scroll" ref={scrollRef}>
        {flat.length === 0 ? (
          <div className="lc-empty">
            <h2>Nothing found</h2>
            <p>
              {kind === 'symbols'
                ? 'Try a name like “arrow”, “euro” or “check”.'
                : 'Try a mood like “happy”, “love” or “shrug”.'}
            </p>
          </div>
        ) : (
          sections.map(s => (
            <section key={s.id} data-section={s.id}>
              <h3 className="lc-section">{s.title}</h3>
              <div
                className="lc-emoji-grid lc-picker-grid"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
                role="listbox"
                aria-label={s.title}
              >
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
                      aria-label={it.name ? `${it.text} ${it.name}` : it.text}
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
            <span className="lc-picker-big">{shown.text}</span>
            {kind === 'symbols' && <span className="lc-emoji-name">{shown.name}</span>}
          </>
        )}
        {hints}
      </div>
    </div>
  );
};
