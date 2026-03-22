import React, { useEffect, useRef, useState } from 'react';
import { categoryDisplayLabel } from '../../../shared/category-display';
import { ClipboardEntry } from '../../../shared/types';
import { ActionTooltip } from './ActionTooltip';

interface ClipboardEntryCardProps {
  entry: ClipboardEntry;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  onCopy: (entry: ClipboardEntry) => void;
  onUpdateNote: (id: number, note: string) => void;
  isSelected?: boolean;
  dataIndex?: number;
}

export const ClipboardEntryCard: React.FC<ClipboardEntryCardProps> = ({
  entry,
  onDelete,
  onPin,
  onCopy,
  onUpdateNote,
  isSelected = false,
  dataIndex,
}) => {
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState(entry.note || '');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const getCategoryIcon = (category?: string) => {
    if (!category) return '📄';
    switch (category.toLowerCase()) {
      case 'text':
        return '📝';
      case 'rich text':
        return '📄✨';
      case 'urls':
        return '🔗';
      case 'images':
        return '🖼️';
      case 'files':
        return '📁';
      case 'code':
        return '💻';
      case 'email addresses':
        return '📧';
      case 'numbers':
        return '🔢';
      case 'phone numbers':
        return '🔢';
      default:
        return '📄';
    }
  };

  const getContentPreview = () => {
    if (entry.format === 'image') {
      // Check if content is base64 data URL
      if (entry.content && entry.content.startsWith('data:image/')) {
        return (
          <div className="flex items-center space-x-2">
            <img
              src={entry.content}
              alt="Clipboard image"
              className="w-12 h-12 object-cover rounded border border-light-border dark:border-dark-border"
              onError={e => {
                // Fallback to text if image fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling!.textContent =
                  '[Image - Preview unavailable]';
              }}
            />
            <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
              Image
            </span>
          </div>
        );
      }
      return '[Image]';
    }

    if (entry.format === 'file') {
      return '[File]';
    }

    if (entry.format === 'html') {
      return (
        <div className="text-sm">{entry.preview || '[Rich HTML Content]'}</div>
      );
    }

    if (entry.format === 'rtf') {
      return (
        <div className="text-sm">{entry.preview || '[Rich RTF Content]'}</div>
      );
    }

    return entry.preview || entry.content;
  };

  const handleSaveNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateNote(entry.id, noteText);
    setIsNoteModalOpen(false);
  };

  const handleOpenNoteModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNoteText(entry.note || '');
    setIsNoteModalOpen(true);
  };

  const truncateNote = (note: string, maxLength: number = 30) => {
    if (note.length <= maxLength) return note;
    return note.substring(0, maxLength) + '...';
  };

  // Download functions
  const downloadAsImage = (format: 'png' | 'jpg') => {
    if (entry.format === 'image' && entry.content.startsWith('data:image/')) {
      const link = document.createElement('a');
      link.href = entry.content;
      link.download = `clipboard-image-${Date.now()}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setIsMenuOpen(false);
  };

  const downloadAsText = () => {
    let textContent = entry.content;

    // For HTML content, extract clean plain text
    if (entry.format === 'html') {
      textContent = extractCleanTextFromHTML(entry.content);
    }

    // For RTF content, use the preview which should contain the extracted text
    if (entry.format === 'rtf') {
      textContent = entry.preview || extractTextFromRTF(entry.content);
    }

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clipboard-text-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  // Helper function to extract clean text from HTML (similar to backend)
  const extractCleanTextFromHTML = (html: string): string => {
    try {
      // Create a temporary DOM element to parse HTML properly
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      // Remove script and style elements
      const scripts = tempDiv.querySelectorAll('script, style');
      scripts.forEach(el => el.remove());

      // Get clean text content
      let text = tempDiv.textContent || tempDiv.innerText || '';

      // Clean up whitespace and formatting
      text = text
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n\s*\n/g, '\n') // Remove empty lines
        .trim();

      return text;
    } catch (error) {
      console.error('Error extracting clean text from HTML:', error);
      // Fallback to simple tag removal
      return html.replace(/<[^>]*>/g, '').trim();
    }
  };

  // Helper function to extract text from RTF
  const extractTextFromRTF = (rtf: string): string => {
    try {
      let text = rtf;

      // Remove RTF header and control tables
      text = text.replace(/^{\s*\\rtf1[^}]*}/g, '');
      text = text.replace(/{\s*\\fonttbl[^}]*}/g, '');
      text = text.replace(/{\s*\\colortbl[^}]*}/g, '');
      text = text.replace(/{\s*\\stylesheet[^}]*}/g, '');

      // Remove RTF control words and symbols
      text = text.replace(/\\[a-z]+\d*\s?/g, '');
      text = text.replace(/\\[^a-z\s]/g, '');
      text = text.replace(/[{}]/g, '');

      // Clean up whitespace
      text = text.replace(/\s+/g, ' ').trim();

      return text;
    } catch (error) {
      console.error('Error extracting text from RTF:', error);
      return rtf;
    }
  };

  const downloadAsDoc = () => {
    const blob = new Blob([entry.content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clipboard-document-${Date.now()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  const downloadAsHTML = () => {
    const blob = new Blob([entry.content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clipboard-richtext-${Date.now()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  // Helper function to convert HTML to RTF with formatting preservation
  const convertHTMLToRTF = (html: string): string => {
    try {
      // First, extract clean text and basic formatting
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      // Remove script, style, and other non-content elements
      const unwantedElements = tempDiv.querySelectorAll(
        'script, style, meta, link'
      );
      unwantedElements.forEach(el => el.remove());

      // Get the text content with basic HTML structure preserved
      let content = tempDiv.innerHTML;

      // Start RTF document
      let rtf =
        '{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0\\fswiss\\fcharset0 Arial;}}';
      rtf += '{\\colortbl ;\\red0\\green0\\blue255;}'; // Blue color for links
      rtf += '\\f0\\fs22 '; // Default font and size

      // Convert basic HTML formatting to RTF
      content = content
        // Bold formatting
        .replace(/<(b|strong)[^>]*>(.*?)<\/(b|strong)>/gi, '{\\b $2}')
        // Italic formatting
        .replace(/<(i|em)[^>]*>(.*?)<\/(i|em)>/gi, '{\\i $2}')
        // Underline formatting
        .replace(/<u[^>]*>(.*?)<\/u>/gi, '{\\ul $2}')
        // Links - extract just the text, not the URL
        .replace(/<a[^>]*>(.*?)<\/a>/gi, '{\\cf1\\ul $1}')
        // Paragraphs
        .replace(/<\/p>/gi, '\\par\\par ')
        .replace(/<p[^>]*>/gi, '')
        // Line breaks
        .replace(/<br[^>]*>/gi, '\\line ')
        // Headers - make them bold
        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '{\\b\\fs28 $1}\\par ')
        // Lists
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\\line ')
        .replace(/<\/(ul|ol)>/gi, '\\par ')
        .replace(/<(ul|ol)[^>]*>/gi, '')
        // Remove all other HTML tags
        .replace(/<[^>]*>/g, '');

      // Clean up HTML entities
      content = content
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");

      // Escape RTF special characters
      content = content
        .replace(/\\/g, '\\\\')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}');

      // Clean up excessive whitespace
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\\par\s*\\par\s*\\par/g, '\\par\\par ')
        .trim();

      rtf += content + '}';

      return rtf;
    } catch (error) {
      console.error('Error converting HTML to RTF:', error);
      // Fallback: create simple RTF with just the text
      const cleanText = extractCleanTextFromHTML(html);
      return `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0\\fswiss\\fcharset0 Arial;}}\\f0\\fs22 ${cleanText}}`;
    }
  };

  const downloadAsJSON = () => {
    const blob = new Blob([entry.content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clipboard-code-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  const getDownloadOptions = () => {
    const category = entry.category?.toLowerCase();
    const format = entry.format;

    if (format === 'image') {
      return [
        {
          label: 'Download as PNG',
          action: () => downloadAsImage('png'),
          icon: '🖼️',
        },
        {
          label: 'Download as JPG',
          action: () => downloadAsImage('jpg'),
          icon: '📷',
        },
      ];
    }

    if (format === 'html') {
      return [
        { label: 'Download as HTML', action: downloadAsHTML, icon: '🌐' },
        { label: 'Download as Text', action: downloadAsText, icon: '📝' },
      ];
    }

    if (format === 'rtf') {
      return [
        { label: 'Download as Text', action: downloadAsText, icon: '📝' },
      ];
    }

    if (category === 'code') {
      return [
        { label: 'Download as JSON', action: downloadAsJSON, icon: '💻' },
        { label: 'Download as Text', action: downloadAsText, icon: '📝' },
      ];
    }

    if (category === 'urls') {
      return [
        { label: 'Download as Text', action: downloadAsText, icon: '🔗' },
        {
          label: 'Download as HTML Link',
          action: () => {
            const htmlContent = `<a href="${entry.content}" target="_blank">${entry.content}</a>`;
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `clipboard-link-${Date.now()}.html`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            setIsMenuOpen(false);
          },
          icon: '🌐',
        },
      ];
    }

    // Default options for text and other content
    return [
      { label: 'Download as Text', action: downloadAsText, icon: '📝' },
      { label: 'Download as Docs', action: downloadAsDoc, icon: '📄' },
    ];
  };

  return (
    <div
      className={`bg-light-bg-secondary dark:bg-dark-bg-secondary border rounded-lg p-2 transition-all duration-200 group cursor-pointer ${
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 shadow-md ring-2 ring-primary-500/20'
          : 'border-light-border dark:border-dark-border hover:bg-light-bg-tertiary dark:hover:bg-dark-bg-tertiary hover:border-primary-300 dark:hover:border-primary-700'
      }`}
      onClick={() => onCopy(entry)}
      data-index={dataIndex}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-2">
          <span className="text-sm">{getCategoryIcon(entry.category)}</span>
          <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
            {categoryDisplayLabel(entry.category)}
          </span>
          {entry.isPinned && <span className="text-xs">📌</span>}
        </div>

        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionTooltip label={entry.note ? 'Edit note' : 'Add note'}>
            <button
              type="button"
              onClick={handleOpenNoteModal}
              className="p-1 hover:bg-light-bg-primary dark:hover:bg-dark-bg-primary rounded text-xs"
              aria-label={entry.note ? 'Edit note' : 'Add note'}
            >
              {entry.note ? '📝' : '📄'}
            </button>
          </ActionTooltip>

          <ActionTooltip label={entry.isPinned ? 'Unpin' : 'Pin'}>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onPin(entry.id);
              }}
              className="p-1 hover:bg-light-bg-primary dark:hover:bg-dark-bg-primary rounded text-xs"
              aria-label={entry.isPinned ? 'Unpin' : 'Pin'}
            >
              {entry.isPinned ? '📌' : '📍'}
            </button>
          </ActionTooltip>

          <ActionTooltip label="Copy to clipboard">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onCopy(entry);
              }}
              className="p-1 hover:bg-light-bg-primary dark:hover:bg-dark-bg-primary rounded text-xs"
              aria-label="Copy to clipboard"
            >
              📋
            </button>
          </ActionTooltip>

          {/* Three-dot menu for download options */}
          <div className="relative" ref={menuRef}>
            <ActionTooltip label="Download options">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                className="p-1 hover:bg-light-bg-primary dark:hover:bg-dark-bg-primary rounded text-xs"
                aria-label="Download options"
              >
                ⋯
              </button>
            </ActionTooltip>

            {isMenuOpen && (
              <div className="absolute right-0 top-8 bg-light-bg-primary dark:bg-dark-bg-primary border border-light-border dark:border-dark-border rounded-lg shadow-lg z-50 min-w-48">
                {getDownloadOptions().map((option, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      option.action();
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-light-bg-secondary dark:hover:bg-dark-bg-secondary flex items-center space-x-2 first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span>{option.icon}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ActionTooltip label="Delete">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onDelete(entry.id);
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded text-xs text-red-600 dark:text-red-400"
              aria-label="Delete"
            >
              🗑️
            </button>
          </ActionTooltip>
        </div>
      </div>

      {/* Content */}
      <ActionTooltip
        label="Click to paste"
        wrapperClassName="block w-full min-w-0"
      >
        <div className="text-sm text-light-text-primary dark:text-dark-text-primary line-clamp-2">
          {getContentPreview()}
        </div>
      </ActionTooltip>

      {/* Note Display */}
      {entry.note && (
        <div className="mt-2 pt-2 border-t border-light-border dark:border-dark-border">
          <div
            className="text-xs text-light-text-secondary dark:text-dark-text-secondary cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            onClick={handleOpenNoteModal}
            title={entry.note}
          >
            📝 {truncateNote(entry.note)}
          </div>
        </div>
      )}

      {/* Note Modal */}
      {isNoteModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={e => {
            e.stopPropagation();
            setIsNoteModalOpen(false);
          }}
        >
          <div
            className="bg-light-bg-primary dark:bg-dark-bg-primary rounded-lg p-6 w-96 max-w-[90vw] shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
              {entry.note ? 'Edit Note' : 'Add Note'}
            </h3>

            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note for this clipboard item..."
              className="w-full h-32 p-3 border border-light-border dark:border-dark-border rounded-lg bg-light-bg-secondary dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />

            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={e => {
                  e.stopPropagation();
                  setIsNoteModalOpen(false);
                }}
                className="px-4 py-2 text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
