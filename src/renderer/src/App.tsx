import { ClipboardList, CornerDownLeft, Smile } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../../shared/electronAPI';
import {
  categoryDisplayLabel,
  entryMatchesCategoryChip,
} from '../../shared/category-display';
import { ClipboardEntry } from '../../shared/types';
import { About } from './components/About';
import { CategoryFilter } from './components/CategoryFilter';
import { EmojiPanel } from './components/EmojiPanel';
import { ClipboardHistory } from './components/ClipboardHistory';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { Sheet } from './components/Sheet';
import { Settings } from './components/Settings';
import { useFontSize } from './hooks/useFontSize';
import { useTheme } from './hooks/useTheme';
import { isMac } from './lib/kinds';

/**
 * Clip selected by default: the newest unpinned clip, so ↵ pastes what was
 * copied last (pinned clips are listed first but are not "the latest").
 * Falls back to the first row when everything is pinned.
 */
/**
 * The order rows are shown in: pinned first, then the rest, newest first in
 * each group. Keyboard selection and ⌘1–9 index into this same list, so it
 * must match what ClipboardHistory renders. (Pinning a clip or receiving a
 * new one changes `entries` in place, which is not display order.)
 */
export function displayOrder(list: ClipboardEntry[]): ClipboardEntry[] {
  const time = (e: ClipboardEntry) => new Date(e.createdAt).getTime() || 0;
  const newestFirst = (a: ClipboardEntry, b: ClipboardEntry) => time(b) - time(a);
  return [
    ...list.filter(e => e.isPinned).sort(newestFirst),
    ...list.filter(e => !e.isPinned).sort(newestFirst),
  ];
}

export function defaultSelection(list: ClipboardEntry[]): number {
  const firstRecent = list.findIndex(e => !e.isPinned);
  return firstRecent === -1 ? 0 : firstRecent;
}

function App() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<ClipboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  /** Clipboard history or the emoji picker (like Win+V's tabs) */
  const [view, setView] = useState<'clips' | 'emoji'>('clips');
  const [emojiQuery, setEmojiQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoCategories, setAutoCategories] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ message: string; path?: string } | null>(null);

  // Short messages from rows (e.g. "Saved clip.png"), hidden after a few seconds
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onToast = (e: Event) => {
      setNotice((e as CustomEvent).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 4000);
    };
    window.addEventListener('lc-toast', onToast);
    return () => {
      window.removeEventListener('lc-toast', onToast);
      clearTimeout(timer);
    };
  }, []);

  // Initialize theme and font size management
  useTheme();
  useFontSize();

  // Load clipboard history on component mount
  useEffect(() => {
    console.log('App component mounted');
    console.log('Current URL:', window.location.href);

    // Check if this is the about window
    const urlParams = new URLSearchParams(window.location.search);
    const isAbout =
      urlParams.get('about') === 'true' ||
      window.electronAPI?.utils?.getWindowLabel?.() === 'about';
    console.log('Is about window:', isAbout);

    if (isAbout) {
      console.log('Setting about window to open');
      setIsAboutOpen(true);
      setLoading(false);
      return;
    }

    // Add a small delay to ensure electronAPI is ready
    const timer = setTimeout(() => {
      loadClipboardHistory();
      loadSettings();
    }, 100);

    // Listen for new clipboard entries
    let unsubscribe: (() => void) | undefined;

    if (window.electronAPI?.on?.clipboardChanged) {
      unsubscribe = window.electronAPI.on.clipboardChanged(entry => {
        setEntries(prev => [entry, ...prev]);
      });
    }

    return () => {
      clearTimeout(timer);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Filter entries when search query or category changes
  useEffect(() => {
    filterEntries();
  }, [entries, searchQuery, selectedCategory, autoCategories]);

  const filteredRef = useRef(filteredEntries);
  filteredRef.current = filteredEntries;

  // Each time the popup opens: fresh search, newest clip selected.
  useEffect(() => {
    const off = window.electronAPI?.on?.windowShown?.(() => {
      setView('clips');
      setEmojiQuery('');
      setSelectedIndex(defaultSelection(filteredRef.current));
      searchRef.current?.focus();
      searchRef.current?.select();
    });
    return () => off?.();
  }, []);

  // Keyboard: ↑↓ move, ↵ paste, ⌘1–9 quick paste, ⌘P pin, ⌘⌫ delete,
  // esc clears search then closes, typing anywhere goes to search.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isAboutOpen || isSettingsOpen || showClearConfirm) return;
      if (event.defaultPrevented || document.querySelector('.lc-scrim')) return;

      const mod = isMac ? event.metaKey : event.ctrlKey;
      const selected = filteredEntries[selectedIndex];

      // ⌘E switches between Clipboard and Emoji
      if (mod && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        switchView(view === 'clips' ? 'emoji' : 'clips');
        return;
      }

      // Emoji tab: EmojiPanel handles arrows / Enter itself
      if (view === 'emoji') {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (emojiQuery) setEmojiQuery('');
          else window.electronAPI?.window?.hide?.();
        } else if (
          event.key.length === 1 &&
          !event.metaKey &&
          !event.ctrlKey &&
          document.activeElement !== searchRef.current
        ) {
          searchRef.current?.focus();
        }
        return;
      }

      if (mod && /^[1-9]$/.test(event.key)) {
        const target = filteredEntries[Number(event.key) - 1];
        if (target) {
          event.preventDefault();
          handleCopyToClipboard(target);
        }
        return;
      }
      if (mod && event.key.toLowerCase() === 'p' && selected) {
        event.preventDefault();
        handlePinEntry(selected.id);
        return;
      }
      if (mod && event.key === 'Backspace' && selected) {
        event.preventDefault();
        handleDeleteEntry(selected.id);
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev =>
            filteredEntries.length === 0
              ? 0
              : (prev + 1) % filteredEntries.length
          );
          return;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev =>
            filteredEntries.length === 0
              ? 0
              : (prev - 1 + filteredEntries.length) % filteredEntries.length
          );
          return;
        case 'Enter':
          event.preventDefault();
          if (selected) handleCopyToClipboard(selected);
          return;
        case 'Escape':
          event.preventDefault();
          if (searchQuery) setSearchQuery('');
          else window.electronAPI?.window?.hide?.();
          return;
      }

      // Printable key while focus is elsewhere → type into search.
      const input = searchRef.current;
      if (
        input &&
        document.activeElement !== input &&
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        input.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    filteredEntries,
    selectedIndex,
    isAboutOpen,
    isSettingsOpen,
    showClearConfirm,
    searchQuery,
    view,
    emojiQuery,
  ]);

  const switchView = (next: 'clips' | 'emoji') => {
    setView(next);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  // Load settings
  const loadSettings = async () => {
    try {
      if (window.electronAPI?.settings?.get) {
        const autoCategoriesSetting =
          await window.electronAPI.settings.get('autoCategories');
        setAutoCategories(autoCategoriesSetting !== false); // Default to true
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadClipboardHistory = async () => {
    try {
      setLoading(true);

      // Check if electronAPI is available
      if (!window.electronAPI) {
        console.error('electronAPI not available');
        setError('Electron API not available');
        return;
      }

      console.log('Loading clipboard history...');
      const history = await window.electronAPI.clipboard.getHistory();
      console.log('Loaded clipboard history:', history.length, 'entries');
      setEntries(history);
      setError(null);
    } catch (err) {
      setError('Failed to load clipboard history');
      console.error('Error loading clipboard history:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterEntries = () => {
    let filtered = entries;

    // Filter by category only if auto-categorization is enabled
    if (autoCategories && selectedCategory !== 'all') {
      filtered = filtered.filter(entry =>
        entryMatchesCategoryChip(entry.category, selectedCategory)
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        entry =>
          entry.content.toLowerCase().includes(query) ||
          entry.preview?.toLowerCase().includes(query) ||
          categoryDisplayLabel(entry.category)
            .toLowerCase()
            .includes(query) ||
          entry.note?.toLowerCase().includes(query)
      );
    }

    // Set the list and its default selection together, so there is never a
    // render where the new rows show but the old selection index applies.
    const ordered = displayOrder(filtered);
    setFilteredEntries(ordered);
    setSelectedIndex(defaultSelection(ordered));
  };

  const handleDeleteEntry = async (id: number) => {
    try {
      const success = await window.electronAPI.clipboard.delete(id);
      if (success) {
        setEntries(prev => prev.filter(entry => entry.id !== id));
      }
    } catch (err) {
      console.error('Error deleting entry:', err);
    }
  };

  const handlePinEntry = async (id: number) => {
    try {
      const updatedEntry = await window.electronAPI.clipboard.pin(id);
      if (updatedEntry) {
        setEntries(prev =>
          prev.map(entry => (entry.id === id ? updatedEntry : entry))
        );
      }
    } catch (err) {
      console.error('Error pinning entry:', err);
    }
  };

  const handleUpdateNote = async (id: number, note: string) => {
    try {
      const updatedEntry = await window.electronAPI.clipboard.updateNote(
        id,
        note
      );
      if (updatedEntry) {
        setEntries(prev =>
          prev.map(entry => (entry.id === id ? updatedEntry : entry))
        );
      }
    } catch (err) {
      console.error('Error updating note:', err);
    }
  };

  const performClearHistory = async () => {
    try {
      const success = await window.electronAPI.clipboard.clear();
      if (success) {
        setEntries(prev => prev.filter(entry => entry.isPinned));
      }
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  const openClearConfirm = () => setShowClearConfirm(true);

  const confirmClearHistory = async () => {
    setShowClearConfirm(false);
    await performClearHistory();
  };

  const handleCopyToClipboard = async (entry: ClipboardEntry) => {
    try {
      // Use smart paste to automatically paste to the target app
      await window.electronAPI.clipboard.smartPaste(entry);
      console.log(
        'Smart pasted to target app:',
        entry.content.substring(0, 50) + '...'
      );
    } catch (err) {
      console.error('Failed to smart paste:', err);
      // Fallback to regular paste
      try {
        await window.electronAPI.clipboard.paste(entry);
        console.log(
          'Fallback paste to clipboard:',
          entry.content.substring(0, 50) + '...'
        );
      } catch (fallbackErr) {
        console.error('All paste methods failed:', fallbackErr);
        // Final fallback to web API
        try {
          await navigator.clipboard.writeText(entry.content);
          console.log('Final fallback - copied to clipboard');
        } catch (finalErr) {
          console.error('All methods failed:', finalErr);
        }
      }
    }
  };

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    // Reload settings to pick up any changes
    loadSettings();
    // Reload clipboard history to reflect any maxHistoryItems changes
    loadClipboardHistory();
  };

  const handleCloseAbout = () => {
    setIsAboutOpen(false);
    // Close the about window
    if (window.electronAPI?.window?.closeAbout) {
      window.electronAPI.window.closeAbout();
    }
  };

  useEffect(() => {
    // Listen for show-settings command from main process
    const showSettings = () => {
      setIsSettingsOpen(true);
    };

    window.electronAPI.on.settingsChanged(showSettings);

    // Cleanup
    return () => {
      // Remove listener if needed
    };
  }, []);

  if (isAboutOpen) {
    return <About isOpen={isAboutOpen} onClose={handleCloseAbout} />;
  }

  const body = () => {
    if (loading) {
      return (
        <div className="lc-empty" role="status">
          Loading clipboard history...
        </div>
      );
    }
    if (error) {
      return (
        <div className="lc-empty" role="alert">
          <h2>{error}</h2>
          <p>The history file could not be read. Try again.</p>
          <button
            type="button"
            className="lc-btn"
            onClick={loadClipboardHistory}
          >
            Try again
          </button>
        </div>
      );
    }
    if (entries.length === 0) {
      return (
        <div className="lc-empty">
          <h2>No clipboard history yet</h2>
          <p>
            Copy something with <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
            <kbd>C</kbd> and it will appear here, ready to{' '}
            <span className="lc-mark">paste again</span>.
          </p>
        </div>
      );
    }
    if (filteredEntries.length === 0) {
      return (
        <div className="lc-empty">
          <h2>Nothing matches</h2>
          <p>
            No clips contain &ldquo;{searchQuery}&rdquo;
            {selectedCategory !== 'all' ? ' in this filter' : ''}.
          </p>
          <button
            type="button"
            className="lc-btn"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
          >
            Show all clips
          </button>
        </div>
      );
    }
    return (
      <ClipboardHistory
        entries={filteredEntries}
        onDeleteEntry={handleDeleteEntry}
        onPinEntry={handlePinEntry}
        onCopyToClipboard={handleCopyToClipboard}
        onUpdateNote={handleUpdateNote}
        selectedIndex={selectedIndex}
      />
    );
  };

  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="lc-shell">
      <div className="lc-top">
        <div className="lc-tabs" role="tablist" aria-label="LocalClip views">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'clips'}
            onClick={() => switchView('clips')}
          >
            <ClipboardList size={15} aria-hidden />
            Clipboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'emoji'}
            onClick={() => switchView('emoji')}
          >
            <Smile size={15} aria-hidden />
            Emoji
          </button>
        </div>
        <Header
          onClearHistory={view === 'clips' ? openClearConfirm : undefined}
          onOpenSettings={handleOpenSettings}
        >
          <SearchBar
            ref={searchRef}
            value={view === 'clips' ? searchQuery : emojiQuery}
            onChange={view === 'clips' ? setSearchQuery : setEmojiQuery}
            placeholder={
              view === 'clips' ? 'Search clipboard history...' : 'Search emoji'
            }
          />
        </Header>
        {view === 'clips' && autoCategories && (
          <CategoryFilter
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            entries={entries}
          />
        )}
      </div>

      {view === 'clips' ? (
        <main className="lc-list">{body()}</main>
      ) : (
        <main className="lc-list is-emoji">
          <EmojiPanel query={emojiQuery} />
        </main>
      )}

      <footer className="lc-foot" aria-label="Keyboard shortcuts">
        <span>
          <kbd>
            <CornerDownLeft size={10} strokeWidth={3} aria-label="Return" />
          </kbd>
          {view === 'clips' ? 'Paste' : 'Insert'}
        </span>
        {view === 'clips' ? (
          <span>
            <kbd>{mod}</kbd>
            <kbd>1</kbd>–<kbd style={{ marginLeft: 4 }}>9</kbd>Quick paste
          </span>
        ) : null}
        <span>
          <kbd>{mod}</kbd>
          <kbd>E</kbd>
          {view === 'clips' ? 'Emoji' : 'Clipboard'}
        </span>
      </footer>

      {notice && (
        <div className="lc-toast" role="status">
          <span>{notice.message}</span>
          {notice.path && window.electronAPI?.utils?.revealInFinder && (
            <button
              type="button"
              onClick={() => {
                void window.electronAPI.utils.revealInFinder?.(notice.path!);
                setNotice(null);
              }}
            >
              Show in Finder
            </button>
          )}
        </div>
      )}

      <Settings isOpen={isSettingsOpen} onClose={handleCloseSettings} />

      {showClearConfirm && (
        <Sheet
          title="Clear clipboard history?"
          labelId="clear-history-title"
          onClose={() => setShowClearConfirm(false)}
          footer={
            <>
              <button
                type="button"
                className="lc-btn"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="lc-btn is-danger"
                onClick={() => void confirmClearHistory()}
                autoFocus
              >
                Clear unpinned clips
              </button>
            </>
          }
        >
          <p>
            Removes every clip that isn&rsquo;t pinned. Pinned clips and what
            is on the clipboard right now stay.
          </p>
        </Sheet>
      )}
    </div>
  );
}

export default App;
