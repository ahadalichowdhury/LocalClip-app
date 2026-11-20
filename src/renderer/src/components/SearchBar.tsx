import { Search, X } from 'lucide-react';
import { forwardRef } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, placeholder = 'Search' }, ref) => (
    <label className="lc-search">
      <Search size={16} strokeWidth={2.2} aria-hidden />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search clips"
        spellCheck={false}
        autoComplete="off"
        size={1} // no intrinsic width; the flex layout sizes it
        autoFocus
      />
      {value && (
        <button
          type="button"
          className="lc-iconbtn"
          style={{ width: '1.5rem', height: '1.5rem' }}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </label>
  )
);
SearchBar.displayName = 'SearchBar';
