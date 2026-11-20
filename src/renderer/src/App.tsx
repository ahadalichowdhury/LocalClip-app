import { ClipboardList, CornerDownLeft, Laugh, Sigma, Smile, SmilePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../../shared/electronAPI';
import {
  categoryDisplayLabel,
  entryMatchesCategoryChip,
} from '../../shared/category-display';
import { ClipboardEntry } from '../../shared/types';
import { About } from './components/About';
import { ActionTooltip } from './components/ActionTooltip';
import { CategoryFilter } from './components/CategoryFilter';
import { EmojiPanel } from './components/EmojiPanel';
import { PickerPanel } from './components/PickerPanel';
import { KAOMOJI_GROUPS, SYMBOL_GROUPS } from './lib/symbols';
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

/** The popup's two tabs; ⌘E switches between them. */
const VIEWS = [
  { id: 'clips', label: 'Clipboard', icon: ClipboardList },
  { id: 'emoji', label: 'Emoji', icon: SmilePlus },
] as const;
type View = (typeof VIEWS)[number]['id'];

/** What the Emoji tab shows (a small switch inside the tab, like Win+V). */
const PICKERS = [
  { id: 'emoji', label: 'Emoji', icon: Smile, search: 'Search emoji' },
  { id: 'kaomoji', label: 'Kaomoji', icon: Laugh, search: 'Search kaomoji' },
  { id: 'symbols', label: 'Symbols', icon: Sigma, search: 'Search symbols' },
] as const;
type Picker = (typeof PICKERS)[number]['id'];

function App() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<ClipboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  /** Clipboard history or the emoji picker (like Win+V's tabs) */
  const [view, setView] = useState<View>('clips');
  const [picker, setPicker] = useState<Picker>('emoji');
  /** Search text of the Emoji / Kaomoji / Symbols tab (cleared on switch) */
  const [pickQuery, setPickQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoCategories, setAutoCategories] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<{ message: string; path?: string } | null>(null);
  const [update, setUpdate] = useState<{ version: string; installing?: boolean } | null>(null);

  // A newer version found by the background update check
  useEffect(() => {
    const utils = window.electronAPI?.utils;
    Promise.resolve(utils?.pendingUpdate?.())
      .then(v => v && setUpdate({ version: v }))
      .catch(() => {});
    const off = window.electronAPI?.on?.updateAvailable?.(version => setUpdate({ version }));
    return () => off?.();
  }, []);

  const installUpdate = async () => {
    if (!update) return;
    setUpdate({ ...update, installing: true });
    try {
      await window.electronAPI.utils.installUpdate?.(); // restarts the app
    } catch (err) {
      setUpdate({ version: update.version });
      setNotice({ message: `Update failed: ${err}` });
    }
  };

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
    // The app removes clips too: the older copy of a repeat, clips over the
    // history limit, and ones past the "delete after" age.
    const offRemoved = window.electronAPI?.on?.clipboardRemoved?.(ids => {
      setEntries(prev => prev.filter(e => !ids.includes(e.id)));
    });
    // e.g. text recognised in an image a moment after it was copied
    const offUpdated = window.electronAPI?.on?.clipboardUpdated?.(updated => {
      setEntries(prev => prev.map(e => (e.id === updated.id ? updated : e)));
    });

    return () => {
      clearTimeout(timer);
      if (unsubscribe) {
        unsubscribe();
      }
      offRemoved?.();
      offUpdated?.();
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
      // short open animation (restart it on every show)
      const shell = shellRef.current;
      if (shell) {
        shell.classList.remove('lc-appear');
        void shell.offsetWidth;
        shell.classList.add('lc-appear');
      }
      setView('clips');
      setPickQuery('');
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
      if (view !== 'clips') {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (pickQuery) setPickQuery('');
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
          if (selected) handleCopyToClipboard(selected, event.shiftKey);
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
    pickQuery,
  ]);

  const switchView = (next: View) => {
    if (next !== view) setPickQuery('');
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
          entry.note?.toLowerCase().includes(query) ||
          entry.ocrText?.toLowerCase().includes(query)
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

  /** Paste into the previous app; `plain` drops formatting (⇧↵ / ⇧-click). */
  const handleCopyToClipboard = async (entry: ClipboardEntry, plain = false) => {
    const api = window.electronAPI.clipboard;
    try {
      await (plain ? api.smartPaste(entry, true) : api.smartPaste(entry));
    } catch (err) {
      console.error('Paste failed:', err);
      if (entry.format === 'file') {
        // e.g. the files were moved or deleted since they were copied
        window.dispatchEvent(new CustomEvent('lc-toast', { detail: { message: String(err) } }));
        return;
      }
      try {
        await (plain ? api.paste(entry, true) : api.paste(entry));
      } catch {
        // Last resort: at least put the text on the clipboard
        try {
          await navigator.clipboard.writeText(entry.content);
        } catch (finalErr) {
          console.error('All paste methods failed:', finalErr);
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
  // Emoji tab: hints share the bar that names the selected item
  const pickerHints = (
    <span className="lc-hints">
      <span>
        <kbd>
          <CornerDownLeft size={10} strokeWidth={3} aria-label="Return" />
        </kbd>
        Insert
      </span>
      <span>
        <kbd>{mod}</kbd>
        <kbd>E</kbd>
        Clipboard
      </span>
    </span>
  );

  return (
    <div className="lc-shell" ref={shellRef}>
      <div className="lc-top">
        <Header
          onClearHistory={view === 'clips' ? openClearConfirm : undefined}
          onOpenSettings={handleOpenSettings}
          leading={
            <div className="lc-tabs" role="tablist" aria-label="LocalClip views">
              {VIEWS.map(v => (
                <ActionTooltip key={v.id} label={`${v.label} (${mod}E)`}>
                  <button
                    type="button"
                    role="tab"
                    aria-label={v.label}
                    aria-selected={view === v.id}
                    onClick={() => switchView(v.id)}
                  >
                    <v.icon size={16} aria-hidden />
                  </button>
                </ActionTooltip>
              ))}
            </div>
          }
          extra={
            view === 'emoji' && (
              <div className="lc-tabs lc-picker-switch" role="group" aria-label="Emoji, kaomoji or symbols">
                {PICKERS.map(p => (
                  <ActionTooltip key={p.id} label={p.label}>
                    <button
                      type="button"
                      aria-label={p.label}
                      aria-pressed={picker === p.id}
                      onClick={() => {
                        if (p.id !== picker) setPickQuery('');
                        setPicker(p.id);
                        searchRef.current?.focus();
                      }}
                    >
                      <p.icon size={16} aria-hidden />
                    </button>
                  </ActionTooltip>
                ))}
              </div>
            )
          }
        >
          <SearchBar
            ref={searchRef}
            value={view === 'clips' ? searchQuery : pickQuery}
            onChange={view === 'clips' ? setSearchQuery : setPickQuery}
            placeholder={
              view === 'clips'
                ? 'Search clipboard history...'
                : PICKERS.find(p => p.id === picker)!.search
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
          {picker === 'emoji' && <EmojiPanel query={pickQuery} hints={pickerHints} />}
          {picker === 'kaomoji' && (
            <PickerPanel
              kind="kaomoji"
              groups={KAOMOJI_GROUPS}
              query={pickQuery}
              columns={2}
              hints={pickerHints}
            />
          )}
          {picker === 'symbols' && (
            <PickerPanel
              kind="symbols"
              groups={SYMBOL_GROUPS}
              query={pickQuery}
              columns={8}
              hints={pickerHints}
            />
          )}
        </main>
      )}

      {view === 'clips' && (
        <footer className="lc-foot" aria-label="Keyboard shortcuts">
          <span>
            <kbd>
              <CornerDownLeft size={10} strokeWidth={3} aria-label="Return" />
            </kbd>
            Paste
          </span>
          <span>
            <kbd>{mod}</kbd>
            <kbd>1</kbd>–<kbd style={{ marginLeft: 4 }}>9</kbd>Quick paste
          </span>
          <span>
            <kbd>{mod}</kbd>
            <kbd>E</kbd>
            Emoji
          </span>
        </footer>
      )}

      {update && !notice && (
        <div className="lc-toast lc-update" role="status">
          <span>
            {update.installing
              ? `Installing LocalClip ${update.version}…`
              : `LocalClip ${update.version} is available`}
          </span>
          {!update.installing && (
            <>
              <button type="button" onClick={() => void installUpdate()}>
                Restart to update
              </button>
              <button
                type="button"
                className="lc-toast-dismiss"
                aria-label="Later"
                title="Later"
                onClick={() => setUpdate(null)}
              >
                ×
              </button>
            </>
          )}
        </div>
      )}

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
