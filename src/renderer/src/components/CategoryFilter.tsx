import React from 'react';
import {
  categoryDisplayLabel,
  entryMatchesCategoryChip,
} from '../../../shared/category-display';
import { ClipboardEntry } from '../../../shared/types';
import { useScrollFade } from '../hooks/useScrollFade';
import { kindOf } from '../lib/kinds';

interface CategoryFilterProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  entries: ClipboardEntry[];
}

// Most-used kinds first; anything unknown goes after, alphabetically.
const ORDER = [
  'Text',
  'URLs',
  'Code',
  'Images',
  'Numbers',
  'Email Addresses',
  'Rich Text',
  'Files',
];

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategory,
  onCategoryChange,
  entries,
}) => {
  const categories = React.useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach(e => {
      const c = categoryDisplayLabel(e.category);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    return Array.from(counts.keys()).sort((a, b) => {
      const ia = ORDER.indexOf(a);
      const ib = ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [entries]);

  const rowRef = React.useRef<HTMLElement>(null);
  useScrollFade(rowRef, [categories.length]);

  // A single kind isn't worth filtering.
  if (categories.length < 2) return null;

  const count = (c: string) =>
    entries.filter(e => entryMatchesCategoryChip(e.category, c)).length;

  return (
    <nav className="lc-filters" aria-label="Filter by kind" ref={rowRef}>
      <button
        type="button"
        className="lc-chip"
        aria-pressed={selectedCategory === 'all'}
        onClick={() => onCategoryChange('all')}
      >
        All <span className="lc-count">{entries.length}</span>
      </button>
      {categories.map(c => {
        const k = kindOf(c);
        const Icon = k.icon;
        const active = selectedCategory === c;
        return (
          <button
            key={c}
            type="button"
            className="lc-chip"
            aria-pressed={active}
            onClick={() => onCategoryChange(active ? 'all' : c)}
          >
            <Icon
              size={13}
              strokeWidth={2.2}
              style={{ color: active ? undefined : k.color }}
              aria-hidden
            />
            {k.label} <span className="lc-count">{count(c)}</span>
          </button>
        );
      })}
    </nav>
  );
};
