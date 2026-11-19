import {
  AtSign,
  Code2,
  Hash,
  Image,
  Link2,
  LucideIcon,
  Pilcrow,
  Type,
  FileText,
} from 'lucide-react';
import { categoryDisplayLabel } from '../../../shared/category-display';
import { ClipboardEntry } from '../../../shared/types';

export type KindInfo = {
  /** Short user-facing name for chips and row meta */
  label: string;
  icon: LucideIcon;
  /** CSS custom property holding the glyph colour */
  color: string;
};

const KINDS: Record<string, KindInfo> = {
  Text: { label: 'Text', icon: Type, color: 'var(--k-text)' },
  'Rich Text': { label: 'Formatted', icon: Pilcrow, color: 'var(--k-rich)' },
  URLs: { label: 'Links', icon: Link2, color: 'var(--k-url)' },
  Images: { label: 'Images', icon: Image, color: 'var(--k-image)' },
  Files: { label: 'Files', icon: FileText, color: 'var(--k-text)' },
  Code: { label: 'Code', icon: Code2, color: 'var(--k-code)' },
  'Email Addresses': { label: 'Emails', icon: AtSign, color: 'var(--k-email)' },
  Numbers: { label: 'Numbers', icon: Hash, color: 'var(--k-number)' },
};

/** Visual info for a stored category (falls back to plain text). */
export function kindOf(category: string | undefined): KindInfo {
  const key = categoryDisplayLabel(category);
  return KINDS[key] ?? { label: key, icon: Type, color: 'var(--k-text)' };
}

/** Singular name used in a row's meta line ("Link", "Code"…). */
export function kindSingular(entry: ClipboardEntry): string {
  switch (categoryDisplayLabel(entry.category)) {
    case 'URLs':
      return 'Link';
    case 'Images':
      return 'Image';
    case 'Email Addresses':
      return 'Email';
    case 'Numbers':
      return 'Number';
    case 'Rich Text':
      return 'Formatted';
    case 'Files':
      return 'File';
    case 'Code':
      return 'Code';
    default:
      return 'Text';
  }
}

/** "now", "4 min", "2 h", "Yesterday", "12 Mar" */
export function relativeTime(value: Date | string | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  const t = date.getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 45) return 'now';
  if (diff < 3600) return `${Math.round(diff / 60)} min`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h`;
  if (diff < 172800) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const isMac =
  typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

/** "CommandOrControl+Shift+V" → ["⌘", "⇧", "V"] */
export function hotkeyParts(accelerator: string): string[] {
  if (!accelerator) return [];
  const map: Record<string, string> = {
    CommandOrControl: isMac ? '⌘' : 'Ctrl',
    Command: '⌘',
    Cmd: '⌘',
    Control: isMac ? '⌃' : 'Ctrl',
    Ctrl: isMac ? '⌃' : 'Ctrl',
    Alt: isMac ? '⌥' : 'Alt',
    Option: '⌥',
    Shift: isMac ? '⇧' : 'Shift',
    Space: 'Space',
    Return: '↵',
    Up: '↑',
    Down: '↓',
    Left: '←',
    Right: '→',
  };
  return accelerator.split('+').map(p => map[p] ?? p);
}
