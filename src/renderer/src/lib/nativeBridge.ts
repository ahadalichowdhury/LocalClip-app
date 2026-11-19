/**
 * Implements the `window.electronAPI` surface on top of Tauri IPC, so the
 * React components didn't need to change when the backend moved from
 * Electron to Rust. Each method maps to a `#[tauri::command]` in
 * `src-tauri/src/commands.rs`.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ElectronAPI } from '../../../shared/electronAPI';
import type { ClipboardEntry } from '../../../shared/types';

/** Subscribe to a backend event; returns a synchronous unsubscribe. */
function on<T>(event: string, cb: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  listen<T>(event, e => cb(e.payload)).then(fn => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

const api: ElectronAPI = {
  window: {
    show: () => invoke('window_show'),
    hide: () => invoke('window_hide'),
    toggle: () => invoke('window_toggle'),
    closeAbout: () => invoke('window_close_about'),
  },
  clipboard: {
    getHistory: options => invoke('clipboard_get_history', { options }),
    delete: id => invoke('clipboard_delete', { id }),
    pin: id => invoke('clipboard_pin', { id }),
    updateNote: (id, note) => invoke('clipboard_update_note', { id, note }),
    clear: () => invoke('clipboard_clear'),
    paste: entry => invoke('clipboard_paste', { entry }),
    smartPaste: entry => invoke('clipboard_smart_paste', { entry }),
    insertText: text => invoke('insert_text', { text }),
    saveToFile: (entry, kind) => invoke('save_clip', { entry, kind }),
  },
  settings: {
    get: key => invoke('settings_get', { key }),
    set: async (key, value) => {
      await invoke('settings_set', { key, value });
    },
    getAll: () => invoke('settings_get_all'),
  },
  hotkey: {
    register: hotkey => invoke('hotkey_register', { hotkey }),
    getCurrent: () => invoke('hotkey_get_current'),
  },
  on: {
    clipboardChanged: cb => on<ClipboardEntry>('clipboard:changed', cb),
    settingsChanged: cb => on<null>('show-settings', () => cb()),
    windowShown: cb => on<null>('window:shown', () => cb()),
  },
  utils: {
    getVersion: () => invoke('app_version'),
    getPlatform: () => 'darwin',
    isProduction: () => !import.meta.env.DEV,
    getWindowLabel: () => getCurrentWindow().label,
    revealInFinder: path => invoke('reveal_in_finder', { path }),
  },
};

window.electronAPI = api;
