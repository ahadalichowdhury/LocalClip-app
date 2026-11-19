import {
  Download,
  FileCode2,
  FileText,
  Globe,
  ImageDown,
  MoreHorizontal,
  Pin,
  PinOff,
  StickyNote,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { categoryDisplayLabel } from '../../../shared/category-display';
import { ClipboardEntry } from '../../../shared/types';
import { isMac, kindOf, kindSingular, relativeTime } from '../lib/kinds';
import { ActionTooltip } from './ActionTooltip';
import { Sheet } from './Sheet';

interface ClipboardEntryCardProps {
  entry: ClipboardEntry;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  onCopy: (entry: ClipboardEntry) => void;
  onUpdateNote: (id: number, note: string) => void;
  isSelected?: boolean;
  dataIndex?: number;
}

// ------------------------------------------------------------ file export

function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, style').forEach(el => el.remove());
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

export type ExportKind = 'png' | 'jpg' | 'txt' | 'html' | 'link' | 'rtf' | 'json';

type ExportOption = {
  label: string;
  icon: React.ReactNode;
  kind: ExportKind;
};

function isJson(text: string): boolean {
  const t = text.trim();
  if (!/^[[{]/.test(t)) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** File types offered in a clip's "Save to file" menu. */
export function exportOptions(entry: ClipboardEntry): ExportOption[] {
  const txt: ExportOption = { label: 'Save as text', icon: <FileText size={15} />, kind: 'txt' };
  const rtf: ExportOption = {
    label: 'Save as document (RTF)',
    icon: <Download size={15} />,
    kind: 'rtf',
  };
  if (entry.format === 'image' && entry.content.startsWith('data:image/')) {
    return [
      { label: 'Save as PNG', icon: <ImageDown size={15} />, kind: 'png' },
      { label: 'Save as JPG', icon: <ImageDown size={15} />, kind: 'jpg' },
    ];
  }
  if (entry.format === 'html') {
    return [{ label: 'Save as web page', icon: <Globe size={15} />, kind: 'html' }, txt, rtf];
  }
  if (entry.format === 'rtf') return [rtf, txt];
  const cat = categoryDisplayLabel(entry.category);
  if (cat === 'URLs') {
    return [{ label: 'Save as link (HTML)', icon: <Globe size={15} />, kind: 'link' }, txt];
  }
  if (isJson(entry.content)) {
    return [{ label: 'Save as JSON', icon: <FileCode2 size={15} />, kind: 'json' }, txt];
  }
  return [txt, rtf];
}

/** Shows a short message in the popup (rendered by App). */
export function toast(message: string, path?: string) {
  window.dispatchEvent(new CustomEvent('lc-toast', { detail: { message, path } }));
}

async function saveEntry(entry: ClipboardEntry, kind: ExportKind) {
  const api = window.electronAPI?.clipboard;
  if (!api?.saveToFile) return;
  try {
    const path = await api.saveToFile(entry, kind);
    if (path) toast(`Saved ${path.split('/').pop()}`, path);
  } catch (err) {
    toast(`Could not save: ${err}`);
  }
}

// ------------------------------------------------------------ row

export const ClipboardEntryCard: React.FC<ClipboardEntryCardProps> = ({
  entry,
  onDelete,
  onPin,
  onCopy,
  onUpdateNote,
  isSelected = false,
  dataIndex,
}) => {
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(entry.note || '');
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAt) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAt(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setMenuAt(null);
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc, true);
    };
  }, [menuAt]);

  const kind = kindOf(entry.category);
  const KindIcon = kind.icon;
  const quickKey =
    dataIndex !== undefined && dataIndex < 9 ? String(dataIndex + 1) : '';
  const cat = categoryDisplayLabel(entry.category);

  const openNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNoteText(entry.note || '');
    setIsNoteOpen(true);
  };
  const saveNote = () => {
    onUpdateNote(entry.id, noteText.trim());
    setIsNoteOpen(false);
  };

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const menuH = 90;
    const y = r.bottom + menuH > window.innerHeight ? r.top - menuH - 4 : r.bottom + 4;
    setMenuAt({ x: Math.max(8, r.right - 176), y });
  };

  const body = () => {
    if (entry.format === 'image' && entry.content.startsWith('data:image/')) {
      return (
        <div className="lc-thumb">
          <img src={entry.content} alt="Copied image" draggable={false} />
        </div>
      );
    }
    const text =
      entry.preview ||
      (entry.format === 'html' ? htmlToText(entry.content) : entry.content);
    return text;
  };

  const bodyClass =
    'lc-body' +
    (cat === 'Code' ? ' is-code' : '') +
    (cat === 'URLs' ? ' is-url' : '');

  return (
    <div
      className={`lc-row${isSelected ? ' is-selected' : ''}`}
      onClick={() => onCopy(entry)}
      data-index={dataIndex}
      role="option"
      aria-selected={isSelected}
    >
      <span
        className="lc-tile"
        style={{ '--kind': kind.color } as React.CSSProperties}
        title={kindSingular(entry)}
        aria-label={kindSingular(entry)}
      >
        <KindIcon size={16} strokeWidth={2.2} aria-hidden />
      </span>

      <div className="lc-main">
        {cat === 'Code' ? (
          <div className="lc-codebox">
            <div className={bodyClass}>{body()}</div>
          </div>
        ) : (
          <div className={bodyClass}>{body()}</div>
        )}
        <div className="lc-meta">
          <span className="lc-app">
            {entry.appName && entry.appName !== 'Unknown App'
              ? `from ${entry.appName}`
              : kindSingular(entry)}
          </span>
        </div>
        {entry.note && (
          <button type="button" className="lc-note" onClick={openNote} title={entry.note}>
            <StickyNote size={12} aria-hidden />
            <span>{entry.note}</span>
          </button>
        )}
      </div>

      <div className="lc-side">
        <time>{relativeTime(entry.createdAt)}</time>
        {quickKey && (
          <kbd className="lc-qk" aria-label={`Command ${quickKey}`}>
            {isMac ? '⌘' : 'Ctrl+'}
            {quickKey}
          </kbd>
        )}
      </div>

      <div className="lc-actions" onClick={e => e.stopPropagation()}>
        <ActionTooltip label={entry.isPinned ? 'Unpin' : 'Pin to top'}>
          <button
            type="button"
            className="lc-iconbtn"
            onClick={() => onPin(entry.id)}
            aria-label={entry.isPinned ? 'Unpin' : 'Pin'}
          >
            {entry.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
        </ActionTooltip>
        <ActionTooltip label={entry.note ? 'Edit note' : 'Add note'}>
          <button
            type="button"
            className="lc-iconbtn"
            onClick={openNote}
            aria-label={entry.note ? 'Edit note' : 'Add note'}
          >
            <StickyNote size={15} />
          </button>
        </ActionTooltip>
        <ActionTooltip label="Save to file">
          <button
            type="button"
            className="lc-iconbtn"
            onClick={openMenu}
            aria-label="Save to file"
            aria-haspopup="menu"
            aria-expanded={!!menuAt}
          >
            <MoreHorizontal size={15} />
          </button>
        </ActionTooltip>
        <ActionTooltip label="Delete">
          <button
            type="button"
            className="lc-iconbtn is-danger"
            onClick={() => onDelete(entry.id)}
            aria-label="Delete"
          >
            <Trash2 size={15} />
          </button>
        </ActionTooltip>
      </div>

      {menuAt &&
        createPortal(
          <div
            ref={menuRef}
            className="lc-menu"
            role="menu"
            style={{ left: menuAt.x, top: menuAt.y }}
            onClick={e => e.stopPropagation()}
          >
            {exportOptions(entry).map(o => (
              <button
                key={o.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuAt(null);
                  void saveEntry(entry, o.kind);
                }}
              >
                {o.icon}
                {o.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      {isNoteOpen && (
        <Sheet
          title={entry.note ? 'Edit note' : 'Add note'}
          labelId={`note-title-${entry.id}`}
          onClose={() => setIsNoteOpen(false)}
          footer={
            <>
              {entry.note && (
                <button
                  type="button"
                  className="lc-btn"
                  style={{ marginRight: 'auto' }}
                  onClick={() => {
                    onUpdateNote(entry.id, '');
                    setIsNoteOpen(false);
                  }}
                >
                  Remove note
                </button>
              )}
              <button type="button" className="lc-btn" onClick={() => setIsNoteOpen(false)}>
                Cancel
              </button>
              <button type="button" className="lc-btn is-primary" onClick={saveNote}>
                Save note
              </button>
            </>
          }
        >
          <textarea
            className="lc-textarea"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                saveNote();
              }
            }}
            placeholder="What is this clip for?"
            autoFocus
          />
        </Sheet>
      )}
    </div>
  );
};
