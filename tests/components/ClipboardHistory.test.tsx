import { render, screen } from '@testing-library/react';
import React from 'react';
import { ClipboardHistory } from '../../src/renderer/src/components/ClipboardHistory';
import { ClipboardEntry } from '../../src/shared/types';

// Mock ClipboardEntryCard component
jest.mock('../../src/renderer/src/components/ClipboardEntryCard', () => ({
  ClipboardEntryCard: ({
    entry,
    isSelected,
  }: {
    entry: ClipboardEntry;
    isSelected: boolean;
  }) => (
    <div
      data-testid={`entry-${entry.id}`}
      className={isSelected ? 'selected' : ''}
    >
      <div>{entry.content}</div>
      <div>{entry.preview}</div>
    </div>
  ),
}));

const mockEntries: ClipboardEntry[] = [
  {
    id: 1,
    content: 'Pinned item',
    contentType: 'text',
    format: 'text',
    preview: 'Pinned item',
    appName: 'TestApp',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    isPinned: true,
    isFavorite: false,
    category: 'Text',
    tags: [],
    usageCount: 0,
  },
  {
    id: 2,
    content: 'Regular item 1',
    contentType: 'text',
    format: 'text',
    preview: 'Regular item 1',
    appName: 'TestApp',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    isPinned: false,
    isFavorite: false,
    category: 'Text',
    tags: [],
    usageCount: 0,
  },
  {
    id: 3,
    content: 'Regular item 2',
    contentType: 'text',
    format: 'text',
    preview: 'Regular item 2',
    appName: 'TestApp',
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
    isPinned: false,
    isFavorite: false,
    category: 'Text',
    tags: [],
    usageCount: 0,
  },
];

describe('ClipboardHistory', () => {
  const mockProps = {
    entries: mockEntries,
    onDeleteEntry: jest.fn(),
    onPinEntry: jest.fn(),
    onCopyToClipboard: jest.fn(),
    onUpdateNote: jest.fn(),
    selectedIndex: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render clipboard entries', () => {
    render(<ClipboardHistory {...mockProps} />);

    // Use getAllByText for text that appears multiple times
    expect(screen.getAllByText('Pinned item')).toHaveLength(2); // content and preview
    expect(screen.getAllByText('Regular item 1')).toHaveLength(2); // content and preview
    expect(screen.getAllByText('Regular item 2')).toHaveLength(2); // content and preview
  });

  it('should separate pinned and unpinned entries', () => {
    render(<ClipboardHistory {...mockProps} />);

    // Should show pinned section
    expect(screen.getByRole('heading', { name: 'Pinned 1' })).toBeInTheDocument();

    // Should show recent section
    expect(screen.getByRole('heading', { name: 'Recent 2' })).toBeInTheDocument();
  });

  it('should handle empty entries list', () => {
    render(<ClipboardHistory {...mockProps} entries={[]} />);

    // Should not crash and should render empty state
    expect(screen.queryByRole('heading', { name: /Pinned/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Recent/ })).not.toBeInTheDocument();
  });

  it('should show only pinned section when no unpinned entries', () => {
    const pinnedOnlyEntries = [mockEntries[0]]; // Only the pinned entry

    render(<ClipboardHistory {...mockProps} entries={pinnedOnlyEntries} />);

    expect(screen.getByRole('heading', { name: 'Pinned 1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Recent/ })).not.toBeInTheDocument();
  });

  it('should show only recent section when no pinned entries', () => {
    const unpinnedOnlyEntries = mockEntries.slice(1); // Only unpinned entries

    render(<ClipboardHistory {...mockProps} entries={unpinnedOnlyEntries} />);

    expect(screen.queryByRole('heading', { name: /Pinned/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Recent/ })).not.toBeInTheDocument(); // No header when no pinned items
  });

  it('should handle selected index correctly', () => {
    render(<ClipboardHistory {...mockProps} selectedIndex={1} />);

    // The first entry (index 0) should not be selected
    const firstEntry = screen.getByTestId('entry-1');
    expect(firstEntry).not.toHaveClass('selected');

    // The second entry (index 1) should be selected
    const secondEntry = screen.getByTestId('entry-2');
    expect(secondEntry).toHaveClass('selected');
  });

  it('should pass correct props to ClipboardEntryCard', () => {
    render(<ClipboardHistory {...mockProps} />);

    // Verify that the entries are rendered with correct test IDs
    expect(screen.getByTestId('entry-1')).toBeInTheDocument();
    expect(screen.getByTestId('entry-2')).toBeInTheDocument();
    expect(screen.getByTestId('entry-3')).toBeInTheDocument();
  });

  it('should handle global index calculation for unpinned entries', () => {
    render(<ClipboardHistory {...mockProps} selectedIndex={2} />);

    // The third entry (global index 2, which is the second unpinned entry) should be selected
    const thirdEntry = screen.getByTestId('entry-3');
    expect(thirdEntry).toHaveClass('selected');
  });

  it('should render without crashing when selectedIndex is -1', () => {
    render(<ClipboardHistory {...mockProps} selectedIndex={-1} />);

    // All entries should be rendered but none selected
    expect(screen.getByTestId('entry-1')).not.toHaveClass('selected');
    expect(screen.getByTestId('entry-2')).not.toHaveClass('selected');
    expect(screen.getByTestId('entry-3')).not.toHaveClass('selected');
  });
});
