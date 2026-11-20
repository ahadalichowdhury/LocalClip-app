export interface ClipboardEntry {
  id: number;
  content: string;
  contentType: string;
  format: 'text' | 'image' | 'file' | 'html' | 'rtf';
  preview?: string;
  filePath?: string;
  appName?: string;
  createdAt: Date;
  updatedAt: Date;
  isPinned: boolean;
  isFavorite: boolean;
  category?: string;
  tags: string[];
  usageCount: number;
  lastUsedAt?: Date;
  note?: string;
  /** Text recognised in an image clip ("" = none found) */
  ocrText?: string;
}

export interface GetHistoryOptions {
  limit?: number;
  offset?: number;
  category?: string;
  contentType?: string;
  dateRange?: DateRange;
  searchQuery?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface Settings {
  // General
  maxHistoryItems: number;
  autoStart: boolean;
  minimizeToTray: boolean;

  // Appearance
  theme: 'light' | 'dark' | 'auto';
  accentColor: string;
  /** Highlighter colour behind the selected clip (see lib/highlight.ts) */
  highlightColor: string;
  /** Frosted, see-through popup background */
  glassEffect: boolean;
  /** Popup background opacity (%) when glass is on */
  glassOpacity: number;
  fontSize: 'small' | 'medium' | 'large';

  // Behavior
  globalHotkey: string;
  monitorClipboard: boolean;
  autoCategories: boolean;

  // Privacy
  excludedApps: string[];
  incognitoMode: boolean;
  encryptData: boolean;

  // Additional
  hideFromDock: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  maxHistoryItems: 40,
  autoStart: true,
  minimizeToTray: true,
  theme: 'auto',
  accentColor: '#0078d4',
  highlightColor: 'yellow',
  glassEffect: false,
  glassOpacity: 70,
  fontSize: 'medium',
  globalHotkey: 'CommandOrControl+Shift+V',
  monitorClipboard: true,
  autoCategories: true,
  excludedApps: [],
  incognitoMode: false,
  encryptData: false,
  hideFromDock: false,
};
