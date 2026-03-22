import { useEffect, useState } from 'react';
import '../../shared/electronAPI';
import {
  categoryDisplayLabel,
  entryMatchesCategoryChip,
} from '../../shared/category-display';
import { ClipboardEntry } from '../../shared/types';
import { About } from './components/About';
import { CategoryFilter } from './components/CategoryFilter';
import { ClipboardHistory } from './components/ClipboardHistory';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { Settings } from './components/Settings';
import { useFontSize } from './hooks/useFontSize';
import { useTheme } from './hooks/useTheme';

function App() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<ClipboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoCategories, setAutoCategories] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Initialize theme and font size management
  useTheme();
  useFontSize();

  // Load clipboard history on component mount
  useEffect(() => {
    console.log('App component mounted');
    console.log('Current URL:', window.location.href);

    // Check if this is the about window
    const urlParams = new URLSearchParams(window.location.search);
    const isAbout = urlParams.get('about') === 'true';
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

  // Reset selected index when filtered entries change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredEntries]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keyboard navigation when not in about window and not in settings
      if (isAboutOpen || isSettingsOpen) return;

      if (showClearConfirm) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setShowClearConfirm(false);
        }
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => {
            if (filteredEntries.length === 0) return 0;
            return prev < filteredEntries.length - 1 ? prev + 1 : 0; // Wrap to first item
          });
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev => {
            if (filteredEntries.length === 0) return 0;
            return prev > 0 ? prev - 1 : filteredEntries.length - 1; // Wrap to last item
          });
          break;
        case 'Enter':
          event.preventDefault();
          if (filteredEntries[selectedIndex]) {
            handleCopyToClipboard(filteredEntries[selectedIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          // Hide the window
          if (window.electronAPI?.window?.hide) {
            window.electronAPI.window.hide();
          }
          break;
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
  ]);

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

    setFilteredEntries(filtered);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-light-bg-primary dark:bg-dark-bg-primary">
        <div className="text-light-text-secondary dark:text-dark-text-secondary">
          Loading clipboard history...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-light-bg-primary dark:bg-dark-bg-primary">
        <div className="text-error text-center">
          <p className="text-lg font-semibold mb-2">Error</p>
          <p>{error}</p>
          <button
            onClick={loadClipboardHistory}
            className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show About window if this is the about instance
  if (isAboutOpen) {
    return (
      <div className="h-screen bg-light-bg-primary dark:bg-dark-bg-primary text-light-text-primary dark:text-dark-text-primary">
        <About isOpen={isAboutOpen} onClose={handleCloseAbout} />
      </div>
    );
  }

  return (
    <div className="h-screen bg-light-bg-primary dark:bg-dark-bg-primary text-light-text-primary dark:text-dark-text-primary flex flex-col overflow-hidden">
      <Header
        onClearHistory={openClearConfirm}
        onOpenSettings={handleOpenSettings}
      />

      <div className="flex-1 p-4 space-y-4 overflow-hidden flex flex-col">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search clipboard history..."
        />

        {autoCategories && (
          <CategoryFilter
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            entries={entries}
          />
        )}

        <div className="flex-1 overflow-hidden">
          <ClipboardHistory
            entries={filteredEntries}
            onDeleteEntry={handleDeleteEntry}
            onPinEntry={handlePinEntry}
            onCopyToClipboard={handleCopyToClipboard}
            onUpdateNote={handleUpdateNote}
            selectedIndex={selectedIndex}
          />

          {filteredEntries.length === 0 && entries.length > 0 && (
            <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
              No entries match your search criteria
            </div>
          )}

          {entries.length === 0 && (
            <div className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
              <p className="text-lg mb-2">No clipboard history yet</p>
              <p className="text-sm">Copy something to get started!</p>
            </div>
          )}
        </div>

        {/* Settings Modal */}
        <Settings isOpen={isSettingsOpen} onClose={handleCloseSettings} />

        {showClearConfirm && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
            onClick={() => setShowClearConfirm(false)}
          >
            <div
              className="bg-light-bg-primary dark:bg-dark-bg-primary rounded-xl shadow-xl border border-light-border dark:border-dark-border max-w-md w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <h2
                id="clear-history-title"
                className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-2"
              >
                Clear clipboard history?
              </h2>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-6">
                This removes every <strong>unpinned</strong> item from your
                history. Pinned items are kept. This does not erase what is
                currently in the system clipboard.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary hover:bg-light-bg-secondary dark:hover:bg-dark-bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmClearHistory()}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  Clear all unpinned
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
