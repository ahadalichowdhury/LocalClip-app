import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClipboardEntry } from '../../../../shared/types';
import { ClipboardEntryCard, exportOptions } from '../ClipboardEntryCard';

const entry: ClipboardEntry = {
  id: 7,
  content: 'Hello from a row',
  contentType: 'text',
  format: 'text',
  preview: 'Hello from a row',
  appName: 'Notes',
  createdAt: new Date(),
  updatedAt: new Date(),
  isPinned: false,
  isFavorite: false,
  category: 'Text',
  tags: [],
  usageCount: 0,
};

const handlers = () => ({
  onDelete: jest.fn(),
  onPin: jest.fn(),
  onCopy: jest.fn(),
  onUpdateNote: jest.fn(),
});

describe('ClipboardEntryCard', () => {
  it('pastes its own entry when clicked', () => {
    const h = handlers();
    render(<ClipboardEntryCard entry={entry} {...h} dataIndex={0} />);
    fireEvent.click(screen.getByText('Hello from a row'));
    expect(h.onCopy).toHaveBeenCalledWith(entry);
  });

  it('shows the quick-paste key for the first nine rows only', () => {
    const h = handlers();
    const { rerender } = render(
      <ClipboardEntryCard entry={entry} {...h} dataIndex={2} />
    );
    expect(screen.getByLabelText('Command 3')).toBeInTheDocument();
    rerender(<ClipboardEntryCard entry={entry} {...h} dataIndex={9} />);
    expect(screen.queryByLabelText(/Command/)).not.toBeInTheDocument();
  });

  it('row actions do not trigger a paste', () => {
    const h = handlers();
    render(<ClipboardEntryCard entry={entry} {...h} dataIndex={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(h.onPin).toHaveBeenCalledWith(7);
    expect(h.onDelete).toHaveBeenCalledWith(7);
    expect(h.onCopy).not.toHaveBeenCalled();
  });

  it('marks the selected row', () => {
    render(<ClipboardEntryCard entry={entry} {...handlers()} isSelected />);
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  });

  it('offers file types that fit the clip', () => {
    const kinds = (e: Partial<ClipboardEntry>) =>
      exportOptions({ ...entry, ...e }).map(o => o.kind);
    expect(kinds({ format: 'image', content: 'data:image/png;base64,AAAA' })).toEqual(['png', 'jpg']);
    expect(kinds({ format: 'rtf' })).toEqual(['rtf', 'txt']);
    expect(kinds({ format: 'html' })).toEqual(['html', 'txt', 'rtf']);
    expect(kinds({ category: 'URLs', content: 'https://a.com' })).toEqual(['link', 'txt']);
    expect(kinds({ category: 'Code', content: '{"a": 1}' })).toEqual(['json', 'txt']);
    // code that isn't JSON doesn't get a broken .json option
    expect(kinds({ category: 'Code', content: 'const a = 1;' })).toEqual(['txt', 'rtf']);
    expect(kinds({})).toEqual(['txt', 'rtf']);
    expect(kinds({ format: 'file', content: '/Users/me/a.pdf', category: 'Files' })).toEqual(['reveal']);
  });

  it('saves through the native dialog and reports where', async () => {
    const saveToFile = jest.fn().mockResolvedValue('/Users/me/Downloads/clip.txt');
    (window.electronAPI.clipboard as any).saveToFile = saveToFile;
    const toasts: string[] = [];
    const onToast = (e: Event) => toasts.push((e as CustomEvent).detail.message);
    window.addEventListener('lc-toast', onToast);

    const h = handlers();
    render(<ClipboardEntryCard entry={entry} {...h} dataIndex={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to file' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Save as text/ }));

    expect(saveToFile).toHaveBeenCalledWith(entry, 'txt');
    await waitFor(() => expect(toasts).toEqual(['Saved clip.txt']));
    expect(h.onCopy).not.toHaveBeenCalled();
    window.removeEventListener('lc-toast', onToast);
  });

  it('shows image clips from their file, falling back to the full image', () => {
    (window.electronAPI.utils as any).fileSrc = (p: string) => `asset://localhost${p}`;
    const img: ClipboardEntry = {
      ...entry,
      format: 'image',
      content: '',
      preview: '[Image]',
      category: 'Images',
      filePath: '/data/images/abc.png',
    };
    render(<ClipboardEntryCard entry={img} {...handlers()} dataIndex={0} />);
    const el = screen.getByAltText('Copied image') as HTMLImageElement;
    expect(el.src).toBe('asset://localhost/data/images/abc_thumb.png');
    fireEvent.error(el);
    expect(el.src).toBe('asset://localhost/data/images/abc.png');
    expect(exportOptions(img).map(o => o.kind)).toEqual(['png', 'jpg']);
  });

  it('pastes the text found in an image as plain text', () => {
    const smartPaste = window.electronAPI.clipboard.smartPaste as jest.Mock;
    smartPaste.mockClear();
    const img: ClipboardEntry = {
      ...entry,
      format: 'image',
      content: '',
      category: 'Images',
      filePath: '/data/images/abc.png',
      ocrText: 'Total: 4821',
    };
    expect(exportOptions(img).map(o => o.kind)).toEqual(['ocr', 'png', 'jpg']);
    render(<ClipboardEntryCard entry={img} {...handlers()} dataIndex={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to file' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Paste text from image/ }));
    expect(smartPaste).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'text', content: 'Total: 4821' }),
      true
    );
  });

  it('menu stays attached to its row, toggles, and closes on scroll', () => {
    render(<ClipboardEntryCard entry={entry} {...handlers()} dataIndex={0} />);
    const more = screen.getByRole('button', { name: 'Save to file' });
    const row = screen.getByRole('option');

    fireEvent.mouseDown(more);
    fireEvent.click(more);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(row).toHaveClass('menu-open'); // actions stay visible under the menu
    expect(more).toHaveAttribute('aria-expanded', 'true');

    // clicking ⋯ again closes it (no close-then-reopen)
    fireEvent.mouseDown(more);
    fireEvent.click(more);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(row).not.toHaveClass('menu-open');

    // scrolling the list closes it rather than leaving it floating
    fireEvent.click(more);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.scroll(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
