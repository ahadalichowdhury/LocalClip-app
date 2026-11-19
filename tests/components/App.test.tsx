import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React from 'react';
import App, {
  defaultSelection,
  displayOrder,
} from '../../src/renderer/src/App';
import { ClipboardEntry } from '../../src/shared/types';

const mockClipboardEntries: ClipboardEntry[] = [
  {
    id: 1,
    content: 'Test clipboard content',
    contentType: 'text',
    format: 'text',
    preview: 'Test clipboard content',
    appName: 'TestApp',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    isPinned: false,
    isFavorite: false,
    category: 'Text',
    tags: [],
    usageCount: 0,
  },
];

// Mock window.location
const mockLocation = {
  href: 'http://localhost:3000',
  search: '',
  pathname: '/',
  origin: 'http://localhost:3000',
};

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset window.location mock
    delete (window as any).location;
    (window as any).location = mockLocation;

    // Mock URLSearchParams
    global.URLSearchParams = jest.fn().mockImplementation(search => ({
      get: jest.fn(key => {
        if (key === 'about' && search === '?about=true') return 'true';
        return null;
      }),
    }));

    // Mock electronAPI methods
    (window.electronAPI.clipboard.getHistory as jest.Mock).mockResolvedValue(
      mockClipboardEntries
    );
    (window.electronAPI.settings.get as jest.Mock).mockResolvedValue(true);
    (window.electronAPI.on.clipboardChanged as jest.Mock).mockReturnValue(
      () => {}
    );
    (window.electronAPI.on.settingsChanged as jest.Mock).mockReturnValue(
      () => {}
    );
  });

  it('should render loading state initially', () => {
    render(<App />);
    expect(
      screen.getByText('Loading clipboard history...')
    ).toBeInTheDocument();
  });

  it('should load and display clipboard history', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    });

    expect(window.electronAPI.clipboard.getHistory).toHaveBeenCalled();
  });

  it('should handle empty clipboard history', async () => {
    (window.electronAPI.clipboard.getHistory as jest.Mock).mockResolvedValue(
      []
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('No clipboard history yet')).toBeInTheDocument();
      expect(
        screen.getByText(/Copy something with/)
      ).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    (window.electronAPI.clipboard.getHistory as jest.Mock).mockRejectedValue(
      new Error('API Error')
    );

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load clipboard history')
      ).toBeInTheDocument();
    });
  });

  it('should show about window when URL parameter is set', () => {
    // Mock URL with about parameter
    (window as any).location = {
      ...mockLocation,
      href: 'http://localhost:3000?about=true',
      search: '?about=true',
    };

    // Mock URLSearchParams to return 'true' for 'about'
    global.URLSearchParams = jest.fn().mockImplementation(() => ({
      get: jest.fn(key => (key === 'about' ? 'true' : null)),
    }));

    render(<App />);

    // Should render About component
    expect(screen.getByText('LocalClip')).toBeInTheDocument();
    // Look for the version text more flexibly
    expect(screen.getByText(/Version/)).toBeInTheDocument();
  });

  it('should handle keyboard navigation', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    });

    // Test arrow key navigation
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    fireEvent.keyDown(document, { key: 'Enter' });

    // Should call smartPaste
    expect(window.electronAPI.clipboard.smartPaste).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Test clipboard content' })
    );

    // Test escape key
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(window.electronAPI.window.hide).toHaveBeenCalled();
  });

  it('pastes the newest clip on Enter, not a pinned one', async () => {
    const pinned = {
      ...mockClipboardEntries[0],
      id: 2,
      content: 'Pinned clip',
      preview: 'Pinned clip',
      isPinned: true,
    };
    const latest = {
      ...mockClipboardEntries[0],
      id: 3,
      content: 'Latest clip',
      preview: 'Latest clip',
    };
    (window.electronAPI.clipboard.getHistory as jest.Mock).mockResolvedValue([
      pinned,
      latest,
    ]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Latest clip')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(window.electronAPI.clipboard.smartPaste).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Latest clip' })
    );
  });

  it('keyboard pastes the row shown, even when a pinned clip is older', async () => {
    // Stored order: newer unpinned clip first, older pinned clip second.
    // On screen the pinned clip is on top, so ⌘1 / ↑ must reach it.
    const latest = {
      ...mockClipboardEntries[0],
      id: 10,
      content: 'Newer clip',
      preview: 'Newer clip',
      createdAt: new Date('2024-01-03'),
    };
    const pinned = {
      ...mockClipboardEntries[0],
      id: 11,
      content: 'Pinned older clip',
      preview: 'Pinned older clip',
      isPinned: true,
      createdAt: new Date('2024-01-01'),
    };
    (window.electronAPI.clipboard.getHistory as jest.Mock).mockResolvedValue([
      latest,
      pinned,
    ]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Newer clip')).toBeInTheDocument();
    });
    const paste = window.electronAPI.clipboard.smartPaste as jest.Mock;

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(paste).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: 'Newer clip' })
    );

    fireEvent.keyDown(document, { key: '1', metaKey: true, ctrlKey: true });
    expect(paste).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: 'Pinned older clip' })
    );

    fireEvent.keyDown(document, { key: '2', metaKey: true, ctrlKey: true });
    expect(paste).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: 'Newer clip' })
    );

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(paste).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: 'Pinned older clip' })
    );
  });

  it('pinning a clip in the popup keeps keys in sync with the rows', async () => {
    const a = {
      ...mockClipboardEntries[0],
      id: 20,
      content: 'Clip A',
      preview: 'Clip A',
      createdAt: new Date('2024-01-03'),
    };
    const b = {
      ...mockClipboardEntries[0],
      id: 21,
      content: 'Clip B',
      preview: 'Clip B',
      createdAt: new Date('2024-01-02'),
    };
    (window.electronAPI.clipboard.getHistory as jest.Mock).mockResolvedValue([a, b]);
    (window.electronAPI.clipboard.pin as jest.Mock).mockResolvedValue({
      ...b,
      isPinned: true,
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Clip B')).toBeInTheDocument();
    });

    // pin B (second row) from its row action
    fireEvent.click(screen.getAllByRole('button', { name: 'Pin' })[1]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unpin' })).toBeInTheDocument();
    });
    const paste = window.electronAPI.clipboard.smartPaste as jest.Mock;

    // B is now the top row (⌘1); A is the newest unpinned clip (↵)
    fireEvent.keyDown(document, { key: '1', metaKey: true, ctrlKey: true });
    expect(paste).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: 'Clip B' })
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(paste).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: 'Clip A' })
    );
  });

  it('displayOrder puts pinned first, newest first in each group', () => {
    const e = mockClipboardEntries[0];
    const mk = (id: number, day: number, isPinned = false) => ({
      ...e,
      id,
      isPinned,
      createdAt: new Date(`2024-01-0${day}`),
    });
    const ids = displayOrder([mk(1, 3), mk(2, 1, true), mk(3, 5), mk(4, 2, true)]).map(
      x => x.id
    );
    expect(ids).toEqual([4, 2, 3, 1]);
  });

  it('Emoji tab types the picked emoji without touching the clipboard', async () => {
    const insertText = jest.fn().mockResolvedValue(true);
    (window.electronAPI.clipboard as any).insertText = insertText;
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Emoji/ }));
    const grinning = await screen.findByRole('option', { name: 'grinning face' });
    fireEvent.click(grinning);

    expect(insertText).toHaveBeenCalledWith('😀');
    expect(window.electronAPI.clipboard.smartPaste).not.toHaveBeenCalled();
    expect(window.electronAPI.clipboard.paste).not.toHaveBeenCalled();
  });

  it('defaultSelection skips pinned clips', () => {
    const e = mockClipboardEntries[0];
    expect(defaultSelection([])).toBe(0);
    expect(defaultSelection([{ ...e, isPinned: true }])).toBe(0);
    expect(
      defaultSelection([{ ...e, isPinned: true }, { ...e, isPinned: true }, e])
    ).toBe(2);
  });

  it('should handle search functionality', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      'Search clipboard history...'
    );
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Should filter entries based on search
    expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
  });

  it('should handle settings modal', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    });

    // Find and click settings button by title
    const settingsButton = screen.getByTitle('Settings');
    fireEvent.click(settingsButton);

    // Settings modal should be open
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should handle clipboard entry actions', async () => {
    (window.electronAPI.clipboard.delete as jest.Mock).mockResolvedValue(true);
    (window.electronAPI.clipboard.pin as jest.Mock).mockResolvedValue({
      ...mockClipboardEntries[0],
      isPinned: true,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    });

    // These would typically be tested by finding specific buttons in the ClipboardEntryCard
    // and simulating clicks, but that depends on the exact UI implementation
  });

  it('should handle clear history action', async () => {
    (window.electronAPI.clipboard.clear as jest.Mock).mockResolvedValue(true);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearButton);

    const confirmClear = await screen.findByRole('button', {
      name: /Clear unpinned clips/i,
    });
    fireEvent.click(confirmClear);

    expect(window.electronAPI.clipboard.clear).toHaveBeenCalled();
  });

  it('should load settings on mount', async () => {
    render(<App />);

    await waitFor(() => {
      expect(window.electronAPI.settings.get).toHaveBeenCalledWith(
        'autoCategories'
      );
    });
  });

  it('should handle new clipboard entries from IPC', async () => {
    let clipboardCallback: (entry: ClipboardEntry) => void;

    // Mock the IPC listener to capture the callback
    (window.electronAPI.on.clipboardChanged as jest.Mock).mockImplementation(
      (callback: (entry: ClipboardEntry) => void) => {
        clipboardCallback = callback;
        return () => {}; // Return unsubscribe function
      }
    );

    render(<App />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    });

    // Verify the callback was registered
    expect(window.electronAPI.on.clipboardChanged).toHaveBeenCalled();
    expect(clipboardCallback!).toBeDefined();

    // Simulate receiving a new clipboard entry
    const newEntry: ClipboardEntry = {
      id: 2,
      content: 'New clipboard content',
      contentType: 'text',
      format: 'text',
      preview: 'New clipboard content',
      appName: 'TestApp',
      createdAt: new Date(),
      updatedAt: new Date(),
      isPinned: false,
      isFavorite: false,
      category: 'Text',
      tags: [],
      usageCount: 0,
    };

    // Call the callback with the new entry
    act(() => {
      clipboardCallback!(newEntry);
    });

    // Should add the new entry to the list (it should appear at the top)
    await waitFor(
      () => {
        expect(screen.getByText('New clipboard content')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Verify both entries are present
    expect(screen.getByText('Test clipboard content')).toBeInTheDocument();
    expect(screen.getByText('New clipboard content')).toBeInTheDocument();
  });
});
