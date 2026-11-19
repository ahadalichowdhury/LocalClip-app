import { ClipboardEntry, GetHistoryOptions, Settings } from './types';

// Name kept for compatibility with the components; implemented by
// src/renderer/src/lib/nativeBridge.ts on top of Tauri.

export interface ElectronAPI {
  clipboard: {
    getHistory: (options?: GetHistoryOptions) => Promise<ClipboardEntry[]>;
    delete: (id: number) => Promise<boolean>;
    pin: (id: number) => Promise<ClipboardEntry | null>;
    updateNote: (id: number, note: string) => Promise<ClipboardEntry | null>;
    clear: () => Promise<boolean>;
    paste: (entry: ClipboardEntry) => Promise<boolean>;
    smartPaste: (entry: ClipboardEntry) => Promise<boolean>;
    /** Type text (e.g. an emoji) into the previous app without using the clipboard */
    insertText?: (text: string) => Promise<boolean>;
    /** Native Save dialog; resolves to the saved path, or null if cancelled */
    saveToFile?: (entry: ClipboardEntry, kind: string) => Promise<string | null>;
  };
  settings: {
    get: (key?: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    getAll: () => Promise<Settings>;
  };
  window: {
    show: () => Promise<void>;
    hide: () => Promise<void>;
    toggle: () => Promise<void>;
    closeAbout: () => Promise<void>;
  };
  hotkey: {
    register: (hotkey: string) => Promise<boolean>;
    getCurrent: () => Promise<string>;
  };
  on: {
    clipboardChanged: (callback: (entry: ClipboardEntry) => void) => () => void;
    settingsChanged: (callback: () => void) => () => void;
    windowShown?: (callback: () => void) => () => void;
  };
  utils: {
    getVersion: () => Promise<string>;
    getPlatform: () => string;
    isProduction: () => boolean;
    getWindowLabel?: () => string;
    revealInFinder?: (path: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
