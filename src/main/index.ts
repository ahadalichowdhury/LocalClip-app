import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Tray,
} from 'electron';
import { join } from 'path';
import { isDev } from '../shared/constants';
import { ClipboardEntry } from '../shared/types';
import { ClipboardMonitor } from './clipboard';
import createAppIcon from './createAppIcon';
import createTrayIcon from './createTrayIcon';
import { JsonStorageManager } from './json-storage';
import { SettingsManager } from './settings';

class LocalClipApp {
  private mainWindow: BrowserWindow | null = null;
  private aboutWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private clipboardMonitor!: ClipboardMonitor;
  private storageManager!: JsonStorageManager;
  private settingsManager!: SettingsManager;
  private currentHotkey: string = '';
  private shouldShowOnReady: boolean = false;
  private targetAppInfo: { bundleId?: string; processId?: number } | null =
    null;
  private activeDisplay: any = null;
  private appIcon: string | undefined;

  constructor() {
    try {
      // Initialize app icon first
      try {
        this.appIcon = createAppIcon();
        console.log('App icon created successfully');
      } catch (error) {
        console.warn('Could not create app icon:', error);
      }

      this.storageManager = new JsonStorageManager();
      this.settingsManager = new SettingsManager();
      this.clipboardMonitor = new ClipboardMonitor(
        this.storageManager,
        this.settingsManager,
        (entry: ClipboardEntry) => this.emitClipboardChange(entry)
      );

      this.setupApp();
      this.setupIPC();
    } catch (error) {
      console.error('Error initializing LocalClip:', error);
      // Show error dialog and quit
      app.whenReady().then(() => {
        const { dialog } = require('electron');
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        dialog.showErrorBox(
          'LocalClip Initialization Error',
          `Failed to initialize LocalClip: ${errorMessage}`
        );
        app.quit();
      });
    }
  }

  private setupApp() {
    // This method will be called when Electron has finished initialization
    app.whenReady().then(async () => {
      try {
        // Set the CS clipboard icon for the dock at startup
        if (process.platform === 'darwin') {
          console.log('🚀 Setting CS clipboard icon at startup...');
          this.setCustomDockIcon();
        }

        // Setup auto-start functionality
        await this.setupAutoStart();

        // Show about window on first run
        this.createAboutWindow();
        this.setupGlobalShortcuts();

        // Setup dock visibility based on settings
        const hideFromDock = await this.settingsManager.get('hideFromDock');
        console.log('Initial hideFromDock setting:', hideFromDock);

        // Setup tray first if we're hiding the dock, or always on Linux
        if (hideFromDock || process.platform === 'linux') {
          this.setupTray();
        }

        // Then update dock visibility
        if (process.platform === 'darwin') {
          if (hideFromDock) {
            app.dock?.hide();
          } else {
            app.dock?.show();
          }
        }

        // Start clipboard monitoring based on settings
        await this.setupClipboardMonitoring();

        console.log('LocalClip started. Showing welcome screen...');

        app.on('activate', () => {
          // On macOS it's common to re-create a window in the app when the
          // dock icon is clicked and there are no other windows open.
          if (BrowserWindow.getAllWindows().length === 0) {
            this.showWindow();
          }
        });
      } catch (error) {
        console.error('Error during app setup:', error);
      }
    });

    // Quit when all windows are closed, except on macOS
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle app termination on macOS
    app.on('will-quit', event => {
      // Clean up resources before quitting
      this.cleanup();
    });

    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  private cleanup() {
    console.log('Cleaning up application resources...');

    try {
      // Stop clipboard monitoring
      if (this.clipboardMonitor) {
        this.clipboardMonitor.stop();
      }

      // Close storage manager
      if (this.storageManager) {
        this.storageManager.close();
      }

      // Clean up tray icon
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
        console.log('Tray icon cleaned up');
      }

      // Clean up global shortcuts
      globalShortcut.unregisterAll();
      console.log('Global shortcuts unregistered');

      // Clean up windows
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.destroy();
        this.mainWindow = null;
      }

      if (this.aboutWindow && !this.aboutWindow.isDestroyed()) {
        this.aboutWindow.destroy();
        this.aboutWindow = null;
      }

      console.log('Application cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  private async setupAutoStart() {
    try {
      const autoStart = await this.settingsManager.get('autoStart');
      if (autoStart !== undefined) {
        app.setLoginItemSettings({
          openAtLogin: autoStart,
          path: process.execPath,
        });
        console.log(`Auto-start ${autoStart ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error('Error setting up auto-start:', error);
    }
  }

  private async setupClipboardMonitoring() {
    try {
      const monitorClipboard =
        await this.settingsManager.get('monitorClipboard');
      if (monitorClipboard !== false) {
        // Default to true if not set
        this.clipboardMonitor.start();
      } else {
        console.log('Clipboard monitoring disabled by user setting');
      }
    } catch (error) {
      console.error('Error setting up clipboard monitoring:', error);
      // Default to starting monitoring if there's an error
      this.clipboardMonitor.start();
    }
  }

  private async updateAutoStart(enabled: boolean) {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
      });
      console.log(`Auto-start ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error updating auto-start:', error);
    }
  }

  private async updateClipboardMonitoring(enabled: boolean) {
    try {
      if (enabled) {
        this.clipboardMonitor.start();
        console.log('Clipboard monitoring enabled');
      } else {
        this.clipboardMonitor.stop();
        console.log('Clipboard monitoring disabled');
      }
    } catch (error) {
      console.error('Error updating clipboard monitoring:', error);
    }
  }

  private createAboutWindow() {
    // Create the about window
    this.aboutWindow = new BrowserWindow({
      width: 400,
      height: 500,
      resizable: false,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'default', // Standard title bar for dragging
      movable: true,
      backgroundColor: '#f8f9fa', // Light theme background
      icon: this.appIcon, // Set the app icon
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false, // Keep animations smooth
      },
    });

    this.aboutWindow.on('ready-to-show', () => {
      if (this.aboutWindow) {
        // Use opacity animation for smoother appearance
        this.aboutWindow.setOpacity(0);
        this.aboutWindow.show();

        // Fade in smoothly
        let opacity = 0;
        const fadeIn = setInterval(() => {
          opacity += 0.1;
          if (opacity >= 1) {
            opacity = 1;
            clearInterval(fadeIn);
          }
          this.aboutWindow?.setOpacity(opacity);
        }, 16); // 60fps

        this.aboutWindow.focus();
        console.log('About window shown');
      }
    });

    // Handle close button click with smooth animation
    this.aboutWindow.on('close', event => {
      if (this.aboutWindow && !this.aboutWindow.isDestroyed()) {
        event.preventDefault(); // Prevent immediate close

        // Smooth fade out
        let opacity = 1;
        const fadeOut = setInterval(() => {
          opacity -= 0.2;
          if (opacity <= 0) {
            clearInterval(fadeOut);
            if (this.aboutWindow && !this.aboutWindow.isDestroyed()) {
              this.aboutWindow.destroy(); // Actually close the window
            }
          } else {
            this.aboutWindow?.setOpacity(opacity);
          }
        }, 16); // 60fps
      }
    });

    this.aboutWindow.on('closed', () => {
      this.aboutWindow = null;
      console.log('About window closed - LocalClip now running in background');
    });

    // Load the app (it will show the About component)
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      this.aboutWindow.loadURL(
        process.env['ELECTRON_RENDERER_URL'] + '?about=true'
      );
    } else {
      const htmlPath = join(__dirname, '../renderer/index.html');
      this.aboutWindow.loadFile(htmlPath, { query: { about: 'true' } });
    }

    // Only open DevTools when explicitly needed
    if (isDev && process.env.OPEN_DEVTOOLS === 'true') {
      this.aboutWindow.webContents.openDevTools();
    }
  }

  private createWindow() {
    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 400,
      height: 500,
      minWidth: 350,
      minHeight: 400,
      maxWidth: 450,
      maxHeight: 600,
      show: false, // Keep hidden initially
      autoHideMenuBar: true,
      titleBarStyle: 'default', // Standard title bar for dragging
      resizable: true,
      movable: true,
      backgroundColor: '#f8f9fa', // Light theme background
      icon: this.appIcon, // Set the app icon
      // Windows-specific options
      ...(process.platform === 'win32' && {
        skipTaskbar: true, // Don't show in taskbar initially
        alwaysOnTop: false, // We'll control this manually
        focusable: true,
        minimizable: true,
        maximizable: false,
        frame: true, // Keep frame for better Windows integration
        thickFrame: true, // Allow resizing
      }),
      // Linux-specific options
      ...(process.platform === 'linux' && {
        skipTaskbar: true, // Don't show in taskbar initially
        alwaysOnTop: false, // We'll control this manually
        focusable: true,
        minimizable: true,
        maximizable: false,
        frame: true, // Keep frame for better Linux integration
        transparent: false, // Avoid transparency issues on some Linux DEs
      }),
      // macOS: allow showing above native fullscreen apps (separate Space)
      ...(process.platform === 'darwin' && {
        fullscreenable: false,
      }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false, // Keep animations smooth
        webSecurity: true,
      },
    });

    // macOS: appear on the active Space, including when another app is fullscreen
    if (process.platform === 'darwin' && this.mainWindow) {
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
    }

    this.mainWindow.on('ready-to-show', () => {
      // If this window was created in response to a hotkey press, show it immediately
      if (this.shouldShowOnReady) {
        // Position window on correct screen if we have display info
        if (this.activeDisplay) {
          this.positionWindowOnActiveScreen(this.activeDisplay);
          this.performSmoothShowWithFocus();
          this.activeDisplay = null; // Clear after use
        } else {
          // Use smooth show for hotkey-triggered windows too
          this.performSmoothShow();
        }
        this.shouldShowOnReady = false;
      } else {
        // Don't show the window automatically - only show when hotkey is pressed
        console.log(
          'Main window ready (staying hidden until hotkey is pressed)'
        );
      }

      // Only open DevTools in development mode and when explicitly needed
      if (
        isDev &&
        this.mainWindow?.webContents &&
        process.env.OPEN_DEVTOOLS === 'true'
      ) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    // Handle close button click with smooth animation
    this.mainWindow.on('close', event => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        event.preventDefault(); // Prevent immediate close

        // Smooth fade out
        let opacity = 1;
        const fadeOut = setInterval(() => {
          opacity -= 0.2;
          if (opacity <= 0) {
            clearInterval(fadeOut);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.destroy(); // Actually close the window
            }
          } else {
            this.mainWindow?.setOpacity(opacity);
          }
        }, 16); // 60fps
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Load the app
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      console.log(
        'Loading renderer from URL:',
        process.env['ELECTRON_RENDERER_URL']
      );
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      const htmlPath = join(__dirname, '../renderer/index.html');
      console.log('Loading renderer from file:', htmlPath);
      this.mainWindow.loadFile(htmlPath);
    }

    // Add error handling for renderer loading
    this.mainWindow.webContents.on(
      'did-fail-load',
      (errorCode, errorDescription) => {
        console.error('Renderer failed to load:', errorCode, errorDescription);
      }
    );

    this.mainWindow.webContents.on('did-finish-load', () => {
      console.log('Renderer finished loading');
    });

    this.mainWindow.focus();

    // Platform-specific window focus handling
    if (process.platform === 'win32') {
      // Windows-specific: Force window to top and focus
      this.mainWindow.setAlwaysOnTop(true);
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.setAlwaysOnTop(false);

      // Additional Windows focus methods
      this.mainWindow.moveTop();
      this.mainWindow.setSkipTaskbar(false);

      // Force focus with a slight delay
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.setAlwaysOnTop(true);
          this.mainWindow.focus();
          this.mainWindow.setAlwaysOnTop(false);
          this.mainWindow.flashFrame(true); // Flash to get user attention
          setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.flashFrame(false); // Stop flashing
            }
          }, 100);
        }
      }, 50);
    } else if (process.platform === 'linux') {
      // Linux-specific: Handle different desktop environments
      this.mainWindow.setAlwaysOnTop(true);
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.setAlwaysOnTop(false);
      this.mainWindow.moveTop();
    }
  }

  private async setupGlobalShortcuts() {
    // Get the current hotkey from settings
    const hotkey =
      (await this.settingsManager.get('globalHotkey')) ||
      'CommandOrControl+Shift+V';

    const success = this.registerGlobalHotkey(hotkey);
    if (!success) {
      console.warn(
        `Failed to register stored hotkey: ${hotkey}, trying default`
      );
      // Try default hotkey if stored one fails
      const defaultSuccess = this.registerGlobalHotkey(
        'CommandOrControl+Shift+V'
      );
      if (defaultSuccess) {
        // Update settings with working default
        await this.settingsManager.set(
          'globalHotkey',
          'CommandOrControl+Shift+V'
        );
      }
    }
  }

  private registerGlobalHotkey(hotkey: string): boolean {
    // Unregister previous hotkey if exists
    if (this.currentHotkey) {
      globalShortcut.unregister(this.currentHotkey);
    }

    // Register new hotkey
    try {
      const success = globalShortcut.register(hotkey, () => {
        // IMMEDIATELY capture the app where user was typing/focused
        // This is the target app where we'll paste the selected item
        this.storeFocusedApp();

        // Show LocalClip window after capturing target with proper positioning
        this.showWindowWithProperFocus();
      });

      if (success) {
        this.currentHotkey = hotkey;
        console.log(`Global hotkey registered: ${hotkey}`);
        return true;
      } else {
        console.error(`Failed to register global hotkey: ${hotkey}`);
        return false;
      }
    } catch (error) {
      console.error(`Error registering global hotkey: ${hotkey}`, error);
      return false;
    }
  }

  private setupTray() {
    try {
      // Create and save the tray icon
      const iconPathOrImage = createTrayIcon();
      console.log(
        'Setting up tray icon:',
        typeof iconPathOrImage === 'string'
          ? `from path: ${iconPathOrImage}`
          : 'from image buffer'
      );

      // Destroy existing tray if it exists
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
      }

      // Create new tray
      this.tray = new Tray(iconPathOrImage);

      // Set tooltip with hotkey info
      const hotkeyInfo = this.currentHotkey ? ` (${this.currentHotkey})` : '';
      this.tray.setToolTip(`LocalClip - Clipboard Manager${hotkeyInfo}`);

      // Create context menu
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show LocalClip',
          click: () => this.showWindowWithProperFocus(),
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => this.showAbout(),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => app.quit(),
        },
      ]);

      // Set the context menu
      this.tray.setContextMenu(contextMenu);

      console.log('Tray icon setup complete');
    } catch (error) {
      console.error('Error setting up tray icon:', error);
      // If tray setup fails, show in dock as fallback
      if (process.platform === 'darwin') {
        app.dock?.show();
      }
    }
  }

  private setCustomDockIcon(): boolean {
    try {
      const { nativeImage } = require('electron');
      const fs = require('fs');

      // Try the CS clipboard icons in order of preference
      const iconPaths = [
        join(__dirname, '../../assets/app.icns'), // ICNS file (best for macOS)
        join(__dirname, '../../assets/512.png'), // High resolution
        join(__dirname, '../../assets/256.png'), // Medium size for dock
        join(__dirname, '../../assets/128.png'), // Smaller fallback
        join(__dirname, '../../assets/app.png'), // Main app icon
        join(process.resourcesPath, 'assets', 'app.icns'), // Production ICNS
        join(process.resourcesPath, 'assets', '512.png'), // Production high-res
        join(process.resourcesPath, 'assets', '256.png'), // Production medium
        join(process.resourcesPath, 'assets', 'app.png'), // Production main
      ].filter(Boolean);

      for (const iconPath of iconPaths) {
        console.log('🔍 Trying CS clipboard icon path:', iconPath);

        if (fs.existsSync(iconPath)) {
          const dockIcon = nativeImage.createFromPath(iconPath);
          console.log('📊 Native image created, isEmpty:', dockIcon.isEmpty());
          console.log('📏 Native image size:', dockIcon.getSize());

          if (!dockIcon.isEmpty()) {
            app.dock?.setIcon(dockIcon);
            console.log(
              '✅ CS clipboard dock icon set successfully from:',
              iconPath
            );
            return true;
          } else {
            console.warn('❌ Empty image from path:', iconPath);
          }
        } else {
          console.warn('❌ Icon file not found at:', iconPath);
        }
      }

      // Try to use the app icon that was created at startup
      if (this.appIcon) {
        try {
          const fallbackIcon = nativeImage.createFromPath(this.appIcon);
          if (!fallbackIcon.isEmpty()) {
            app.dock?.setIcon(fallbackIcon);
            console.log('✅ Used startup app icon as fallback for dock');
            return true;
          }
        } catch (error) {
          console.error('❌ Error using startup app icon as fallback:', error);
        }
      }

      console.warn('⚠️ Could not set CS clipboard dock icon from any path');
      return false;
    } catch (error) {
      console.error('❌ Error setting CS clipboard dock icon:', error);
      return false;
    }
  }

  private async updateDockVisibility(hideFromDock: boolean) {
    try {
      console.log(
        `updateDockVisibility called with hideFromDock: ${hideFromDock}, platform: ${process.platform}, isPackaged: ${app.isPackaged}`
      );

      if (process.platform === 'darwin') {
        if (hideFromDock) {
          // First ensure tray is set up
          if (!this.tray) {
            console.log('Setting up tray before hiding dock...');
            this.setupTray();

            // Wait a bit for tray to be ready
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Verify tray is actually created
          if (!this.tray) {
            console.error('Failed to create tray icon, cannot hide dock');
            return;
          }

          // Then hide dock
          app.dock?.hide();
          console.log('Dock hidden successfully');
        } else {
          // CRITICAL: Set custom icon BEFORE showing dock to prevent Electron default
          console.log(
            '🔄 Setting custom CS clipboard icon before showing dock...'
          );
          this.setCustomDockIcon();

          // Small delay to ensure icon is set
          await new Promise(resolve => setTimeout(resolve, 50));

          // Now show dock
          app.dock?.show();
          console.log('✅ Dock shown with custom CS clipboard icon');

          // Set icon again after showing to ensure it sticks (some macOS versions need this)
          setTimeout(() => {
            console.log('🔄 Re-applying custom icon after dock show...');
            this.setCustomDockIcon();
          }, 100);

          // Then remove tray
          if (this.tray) {
            this.tray.destroy();
            this.tray = null;
            console.log('Tray icon removed');
          }
        }
      } else if (process.platform === 'linux') {
        // For Linux, we'll always show the tray icon
        if (!this.tray) {
          console.log('Setting up tray for Linux...');
          this.setupTray();
        }

        // Linux-specific: Detect desktop environment and adjust behavior
        this.detectLinuxDesktopEnvironment();
      } else if (process.platform === 'win32') {
        // Windows-specific: Always use tray icon for better integration
        if (!this.tray) {
          console.log('Setting up tray for Windows...');
          this.setupTray();
        }
      }
    } catch (error) {
      console.error('Error updating dock visibility:', error);
      // If there's an error, ensure we have a tray icon as fallback
      if (!this.tray && hideFromDock) {
        console.log('Attempting to setup tray as fallback...');
        try {
          this.setupTray();
        } catch (fallbackError) {
          console.error('Failed to setup tray as fallback:', fallbackError);
          // If we can't create a tray, show the dock to ensure app is accessible
          if (process.platform === 'darwin') {
            app.dock?.show();
            console.log('Showing dock as final fallback');
          }
        }
      }
    }
  }

  private setupIPC() {
    // Window management
    ipcMain.handle('window:show', () => this.showWindowWithProperFocus());
    ipcMain.handle('window:hide', () => this.hideWindow());
    ipcMain.handle('window:toggle', () => this.toggleWindow());
    ipcMain.handle('window:closeAbout', () => this.closeAboutWindow());

    // Clipboard operations
    ipcMain.handle('clipboard:getHistory', async (_, options = {}) => {
      try {
        // Get the user's maxHistoryItems setting and use it as the limit
        const maxHistoryItems =
          (await this.settingsManager.get('maxHistoryItems')) || 40;

        // Apply the user's limit setting to the options
        const optionsWithLimit = {
          ...options,
          limit: options.limit || maxHistoryItems,
        };

        return await this.storageManager.getClipboardHistory(optionsWithLimit);
      } catch (error) {
        console.error('Error getting clipboard history:', error);
        // Return empty array instead of throwing error
        return [];
      }
    });

    ipcMain.handle('clipboard:add', async (_, entry) => {
      try {
        // Get max history items setting for FIFO enforcement
        const maxHistoryItems =
          (await this.settingsManager.get('maxHistoryItems')) || 40;
        return await this.storageManager.addClipboardEntry(
          entry,
          maxHistoryItems
        );
      } catch (error) {
        console.error('Error adding clipboard entry:', error);
        throw error;
      }
    });

    ipcMain.handle('clipboard:delete', async (_, id) => {
      try {
        return await this.storageManager.deleteClipboardEntry(id);
      } catch (error) {
        console.error('Error deleting clipboard entry:', error);
        return false;
      }
    });

    ipcMain.handle('clipboard:pin', async (_, id) => {
      try {
        return await this.storageManager.pinClipboardEntry(id);
      } catch (error) {
        console.error('Error pinning clipboard entry:', error);
        return null;
      }
    });

    ipcMain.handle('clipboard:updateNote', async (_, id, note) => {
      try {
        return await this.storageManager.updateClipboardEntry(id, { note });
      } catch (error) {
        console.error('Error updating clipboard entry note:', error);
        return null;
      }
    });

    ipcMain.handle('clipboard:clear', async () => {
      try {
        return await this.storageManager.clearClipboardHistory();
      } catch (error) {
        console.error('Error clearing clipboard history:', error);
        return false;
      }
    });

    ipcMain.handle('clipboard:paste', async (_, entry) => {
      // Use smart paste to target app with rich text support
      await this.pasteToTargetApp(entry);
      return true;
    });

    ipcMain.handle('clipboard:smartPaste', async (_, entry) => {
      // Smart paste with target app detection and rich text support
      await this.pasteToTargetApp(entry);
      return true;
    });

    // Settings operations
    ipcMain.handle('settings:get', async (_, key) => {
      return this.settingsManager.get(key);
    });

    ipcMain.handle('settings:set', async (_, key, value) => {
      console.log(`Setting ${key} to:`, value);
      await this.settingsManager.set(key, value);

      // Apply settings changes immediately
      if (key === 'autoStart') {
        await this.updateAutoStart(value);
      } else if (key === 'monitorClipboard') {
        await this.updateClipboardMonitoring(value);
      } else if (key === 'hideFromDock') {
        console.log('Updating dock visibility:', value);
        await this.updateDockVisibility(value);
      } else if (key === 'maxHistoryItems') {
        // Immediately enforce the new limit when maxHistoryItems changes
        console.log('Enforcing new maxHistoryItems limit:', value);
        await this.storageManager.enforceHistoryLimit(value);
      }

      return true;
    });

    ipcMain.handle('settings:getAll', async () => {
      return this.settingsManager.getAll();
    });

    // App info
    ipcMain.handle('app:getVersion', () => app.getVersion());

    // Hotkey management
    ipcMain.handle('hotkey:register', async (_, hotkey: string) => {
      const success = this.registerGlobalHotkey(hotkey);
      if (success) {
        // Save the hotkey to settings only if registration was successful
        await this.settingsManager.set('globalHotkey', hotkey);
      }
      return success;
    });

    ipcMain.handle('hotkey:getCurrent', () => {
      return this.currentHotkey;
    });

    // Utils handlers
    ipcMain.handle('utils:getVersion', () => {
      return app.getVersion();
    });
  }

  // Method to emit clipboard changes to renderer
  private emitClipboardChange(entry: ClipboardEntry) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('clipboard:changed', entry);
    }
  }

  private showWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }

      this.smoothShowWindow();
    } else {
      // Set flag to show window when ready since this is triggered by hotkey
      this.shouldShowOnReady = true;
      this.createWindow();
    }
  }

  private showWindowWithProperFocus() {
    try {
      // Get cursor position and active screen info
      const { screen } = require('electron');
      const cursor = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursor);

      console.log('🖱️ Cursor position:', cursor);
      console.log('🖥️ Active display:', activeDisplay.bounds);

      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }

        // Position window on the screen where cursor/user is active
        this.positionWindowOnActiveScreen(activeDisplay);
        this.smoothShowWindowWithFocus();
      } else {
        // Store display info for when window is ready
        this.activeDisplay = activeDisplay;
        this.shouldShowOnReady = true;
        this.createWindow();
      }
    } catch (error) {
      console.error('Error showing window with proper focus:', error);
      // Fallback to regular show
      this.showWindow();
    }
  }

  private positionWindowOnActiveScreen(display: any) {
    if (!this.mainWindow) return;

    try {
      const { x, y, width, height } = display.bounds;
      const windowBounds = this.mainWindow.getBounds();

      // Center window on the active display
      const centerX = x + (width - windowBounds.width) / 2;
      const centerY = y + (height - windowBounds.height) / 2;

      // Ensure window is within display bounds
      const finalX = Math.max(
        x,
        Math.min(centerX, x + width - windowBounds.width)
      );
      const finalY = Math.max(
        y,
        Math.min(centerY, y + height - windowBounds.height)
      );

      console.log(
        `📍 Positioning window at (${finalX}, ${finalY}) on display ${display.id}`
      );
      this.mainWindow.setPosition(
        Math.round(finalX),
        Math.round(finalY),
        false
      );

      // Platform-specific focus handling
      if (process.platform === 'darwin') {
        // macOS: Handle fullscreen and Spaces properly
        this.handleMacOSWindowFocus();
      } else if (process.platform === 'win32') {
        // Windows: Handle fullscreen apps and taskbar
        this.handleWindowsWindowFocus();
      } else {
        // Linux: Handle different desktop environments
        this.handleLinuxWindowFocus();
      }
    } catch (error) {
      console.error('Error positioning window:', error);
    }
  }

  private handleMacOSWindowFocus() {
    if (!this.mainWindow) return;

    try {
      // 'screen-saver' sits above native fullscreen; pair with setVisibleOnAllWorkspaces
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver');

      // Force window to current Space/Desktop
      const { app } = require('electron');
      app.focus({ steal: true });

      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.focus();
          this.mainWindow.moveTop();
          // Keep always-on-top while visible so we don't drop behind fullscreen; cleared in hideWindow
        }
      }, 50);
    } catch (error) {
      console.error('Error handling macOS window focus:', error);
    }
  }

  private handleWindowsWindowFocus() {
    if (!this.mainWindow) return;

    try {
      // Windows: Use screen-saver level to appear above fullscreen apps
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.flashFrame(true);

      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.flashFrame(false);
          this.mainWindow.setAlwaysOnTop(false);
          this.mainWindow.moveTop();
        }
      }, 150);
    } catch (error) {
      console.error('Error handling Windows window focus:', error);
    }
  }

  private handleLinuxWindowFocus() {
    if (!this.mainWindow) return;

    try {
      // Linux: Force window to top with high priority
      this.mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.moveTop();

      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.setAlwaysOnTop(false);
        }
      }, 100);
    } catch (error) {
      console.error('Error handling Linux window focus:', error);
    }
  }

  private smoothShowWindowWithFocus() {
    if (!this.mainWindow) return;

    // Ensure window is ready before showing
    if (!this.mainWindow.webContents.isLoading()) {
      this.performSmoothShowWithFocus();
    } else {
      // Wait for content to load
      this.mainWindow.webContents.once('did-finish-load', () => {
        this.performSmoothShowWithFocus();
      });
    }
  }

  private performSmoothShowWithFocus() {
    if (!this.mainWindow) return;

    // Set opacity to 0 and show
    this.mainWindow.setOpacity(0);
    this.mainWindow.show();

    // Small delay to ensure window is rendered
    setTimeout(() => {
      if (!this.mainWindow) return;

      // Smooth fade in with easing
      let opacity = 0;
      const startTime = Date.now();
      const duration = 120; // Short duration for snappy feel

      const fadeIn = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out animation for smoother feel
        opacity = 1 - Math.pow(1 - progress, 3);

        if (progress >= 1) {
          opacity = 1;
          clearInterval(fadeIn);
        }
        this.mainWindow?.setOpacity(opacity);
      }, 8);

      // Focus after fade in starts
      this.mainWindow.focus();
      this.mainWindow.moveTop();
    }, 50);
  }

  private smoothShowWindow() {
    if (!this.mainWindow) return;

    // Ensure window is ready before showing
    if (!this.mainWindow.webContents.isLoading()) {
      this.performSmoothShow();
    } else {
      // Wait for content to load
      this.mainWindow.webContents.once('did-finish-load', () => {
        this.performSmoothShow();
      });
    }
  }

  private performSmoothShow() {
    if (!this.mainWindow) return;

    // Set opacity to 0 and show
    this.mainWindow.setOpacity(0);
    this.mainWindow.show();

    // Small delay to ensure window is rendered
    setTimeout(() => {
      if (!this.mainWindow) return;

      // Smooth fade in with easing
      let opacity = 0;
      const startTime = Date.now();
      const duration = 120; // Short duration for snappy feel

      const fadeIn = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out animation for smoother feel
        opacity = 1 - Math.pow(1 - progress, 3);

        if (progress >= 1) {
          opacity = 1;
          clearInterval(fadeIn);
        }
        this.mainWindow?.setOpacity(opacity);
      }, 8);

      this.mainWindow.focus();

      // Platform-specific window focus handling
      if (process.platform === 'win32') {
        // Windows-specific: Force window to top and focus
        this.mainWindow.setAlwaysOnTop(true);
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.setAlwaysOnTop(false);

        // Additional Windows focus methods
        this.mainWindow.moveTop();
        this.mainWindow.setSkipTaskbar(false);

        // Force focus with a slight delay
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setAlwaysOnTop(true);
            this.mainWindow.focus();
            this.mainWindow.setAlwaysOnTop(false);
            this.mainWindow.flashFrame(true); // Flash to get user attention
            setTimeout(() => {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.flashFrame(false); // Stop flashing
              }
            }, 100);
          }
        }, 50);
      } else if (process.platform === 'linux') {
        // Linux-specific: Handle different desktop environments
        this.mainWindow.setAlwaysOnTop(true);
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.setAlwaysOnTop(false);
        this.mainWindow.moveTop();
      } else if (process.platform === 'darwin') {
        this.handleMacOSWindowFocus();
      }
    }, 50); // Close the setTimeout callback
  }

  private hideWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // Smooth fade out before hiding
      let opacity = 1;
      const fadeOut = setInterval(() => {
        opacity -= 0.3; // Faster fade for hiding
        if (opacity <= 0) {
          clearInterval(fadeOut);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (process.platform === 'darwin') {
              this.mainWindow.setAlwaysOnTop(false);
            }
            this.mainWindow.hide();
            this.mainWindow.setOpacity(1); // Reset opacity for next show
          }
        } else {
          this.mainWindow?.setOpacity(opacity);
        }
      }, 16); // 60fps
    }
  }

  private toggleWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideWindow();
      } else {
        this.showWindow();
      }
    } else {
      this.createWindow();
    }
  }

  private closeAboutWindow() {
    if (this.aboutWindow && !this.aboutWindow.isDestroyed()) {
      // Smooth fade out before closing
      let opacity = 1;
      const fadeOut = setInterval(() => {
        opacity -= 0.2;
        if (opacity <= 0) {
          clearInterval(fadeOut);
          if (this.aboutWindow && !this.aboutWindow.isDestroyed()) {
            this.aboutWindow.destroy();
          }
        } else {
          this.aboutWindow?.setOpacity(opacity);
        }
      }, 16); // 60fps
    }
  }

  private storeFocusedApp() {
    try {
      // On macOS, we can get the frontmost application
      if (process.platform === 'darwin') {
        const { execSync } = require('child_process');

        // Use synchronous execution to get immediate result
        const result = execSync(
          'osascript -e "tell application \\"System Events\\" to get bundle identifier of first application process whose frontmost is true"',
          { encoding: 'utf8', timeout: 1000 }
        );

        if (result && result.trim()) {
          const bundleId = result.trim();

          // Don't store LocalClip itself as target app
          if (
            bundleId !== 'com.github.Electron' &&
            bundleId !== app.getName()
          ) {
            this.targetAppInfo = { bundleId };
            console.log('Stored target app:', bundleId);
          } else {
            console.log('Target app is LocalClip itself, using fallback paste');
            console.log('Content copied to clipboard (target was LocalClip)');
          }
        }
      } else if (process.platform === 'win32') {
        // Windows implementation - simplified approach
        const { execSync } = require('child_process');

        try {
          // Get the foreground window process using a simpler PowerShell command
          const result = execSync(
            'powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \\"\\"} | Sort-Object CPU -Descending | Select-Object -First 1 | Select-Object -ExpandProperty ProcessName"',
            { encoding: 'utf8', timeout: 1500 }
          );

          if (result && result.trim()) {
            const processName = result.trim();

            // Don't store LocalClip itself as target app
            if (
              processName.toLowerCase() !== 'localclip' &&
              processName.toLowerCase() !== 'electron' &&
              !processName.toLowerCase().includes('localclip')
            ) {
              this.targetAppInfo = { processId: 0, bundleId: processName };
              console.log('Stored target app (Windows):', processName);
            } else {
              console.log(
                'Target app is LocalClip itself, using fallback paste'
              );
              console.log('Content copied to clipboard (target was LocalClip)');
              this.targetAppInfo = { processId: 0, bundleId: 'fallback' };
            }
          } else {
            // Fallback when no specific app detected
            this.targetAppInfo = { processId: 0, bundleId: 'fallback' };
          }
        } catch (error) {
          console.log('Windows target app detection failed, using fallback');
          // Fallback: just store a generic target
          this.targetAppInfo = { processId: 0, bundleId: 'fallback' };
        }
      } else if (process.platform === 'linux') {
        // Linux implementation - handle different desktop environments
        const { execSync } = require('child_process');

        try {
          let processName = '';

          // Try different methods based on available tools
          // Method 1: Try xdotool (works on X11)
          try {
            const windowId = execSync('xdotool getactivewindow', {
              encoding: 'utf8',
              timeout: 1000,
              stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
            }).trim();

            if (windowId) {
              const pid = execSync(`xdotool getwindowpid ${windowId}`, {
                encoding: 'utf8',
                timeout: 1000,
                stdio: ['pipe', 'pipe', 'ignore'],
              }).trim();

              if (pid) {
                processName = execSync(`ps -p ${pid} -o comm=`, {
                  encoding: 'utf8',
                  timeout: 1000,
                }).trim();
              }
            }
          } catch (xdotoolError) {
            // xdotool failed, try other methods
          }

          // Method 2: Try wmctrl (works on most X11 window managers)
          if (!processName) {
            try {
              const activeWindow = execSync(
                'wmctrl -l | grep "$(xprop -root _NET_ACTIVE_WINDOW | cut -d\' \' -f5)"',
                {
                  encoding: 'utf8',
                  timeout: 1000,
                  stdio: ['pipe', 'pipe', 'ignore'],
                }
              ).trim();

              if (activeWindow) {
                // Extract process name from window title or class
                const windowClass = execSync(
                  "xprop -id $(xprop -root _NET_ACTIVE_WINDOW | cut -d' ' -f5) WM_CLASS",
                  {
                    encoding: 'utf8',
                    timeout: 1000,
                    stdio: ['pipe', 'pipe', 'ignore'],
                  }
                ).trim();

                if (windowClass) {
                  const match = windowClass.match(/"([^"]+)"/);
                  if (match) {
                    processName = match[1];
                  }
                }
              }
            } catch (wmctrlError) {
              // wmctrl failed, try other methods
            }
          }

          // Method 3: Try gdbus for GNOME/Wayland
          if (!processName) {
            try {
              const gnomeWindows = execSync(
                'gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "global.get_window_actors().map(a => a.meta_window.get_wm_class()).join(\',\')"',
                {
                  encoding: 'utf8',
                  timeout: 1500,
                  stdio: ['pipe', 'pipe', 'ignore'],
                }
              ).trim();

              if (gnomeWindows && gnomeWindows.includes('true')) {
                // Parse the result to get the active window class
                const match = gnomeWindows.match(/"([^"]+)"/);
                if (match) {
                  const windowClasses = match[1].split(',');
                  if (windowClasses.length > 0) {
                    processName = windowClasses[0]; // Get the first (likely active) window
                  }
                }
              }
            } catch (gnomeError) {
              // GNOME method failed
            }
          }

          // Method 4: Fallback - try ps with some heuristics
          if (!processName) {
            try {
              const processes = execSync(
                'ps aux --sort=-%cpu | head -10 | grep -v "LocalClip\\|electron" | awk \'{print $11}\' | head -1',
                {
                  encoding: 'utf8',
                  timeout: 1000,
                }
              ).trim();

              if (processes) {
                processName = processes.split('/').pop() || processes;
              }
            } catch (psError) {
              // ps method failed
            }
          }

          if (processName && processName.trim()) {
            const cleanProcessName = processName.trim();

            // Don't store LocalClip itself as target app
            if (
              cleanProcessName.toLowerCase() !== 'localclip' &&
              cleanProcessName.toLowerCase() !== 'electron' &&
              !cleanProcessName.toLowerCase().includes('localclip')
            ) {
              this.targetAppInfo = { processId: 0, bundleId: cleanProcessName };
              console.log('Stored target app (Linux):', cleanProcessName);
            } else {
              console.log(
                'Target app is LocalClip itself, using fallback paste'
              );
              console.log('Content copied to clipboard (target was LocalClip)');
              this.targetAppInfo = { processId: 0, bundleId: 'fallback' };
            }
          } else {
            // Fallback when no specific app detected
            this.targetAppInfo = { processId: 0, bundleId: 'fallback' };
            console.log('Linux target app detection failed, using fallback');
          }
        } catch (error: any) {
          console.log(
            'Linux target app detection failed, using fallback:',
            error.message
          );
          this.targetAppInfo = { processId: 0, bundleId: 'fallback' };
        }
      } else {
        // Linux and other platforms - basic fallback
        this.targetAppInfo = { processId: 0, bundleId: 'fallback' };
        console.log(
          'Stored generic target app for platform:',
          process.platform
        );
      }
    } catch (error) {
      console.error('Error storing focused app:', error);
    }
  }

  private async pasteToTargetApp(entry: ClipboardEntry) {
    try {
      // Temporarily disable clipboard monitoring
      this.clipboardMonitor.stop();

      // First, copy content to clipboard
      const { clipboard, nativeImage } = require('electron');

      // Check if content is a base64 image
      if (entry.content.startsWith('data:image/')) {
        // Extract base64 data and create native image
        const base64Data = entry.content.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const image = nativeImage.createFromBuffer(imageBuffer);
        clipboard.writeImage(image);
        console.log('📸 Image copied to clipboard for pasting');
      } else if (entry.format === 'html') {
        // Write rich HTML content to clipboard
        clipboard.write({
          text: entry.preview || this.extractTextFromHTML(entry.content),
          html: entry.content,
        });
        console.log('🌐 Rich HTML content copied to clipboard for pasting');
      } else if (entry.format === 'rtf') {
        // Write RTF content to clipboard
        clipboard.write({
          text: entry.preview || this.extractTextFromRTF(entry.content),
          rtf: entry.content,
        });
        console.log('📄 Rich RTF content copied to clipboard for pasting');
      } else {
        // Plain text
        clipboard.writeText(entry.content);
        console.log('📝 Text copied to clipboard for pasting');
      }

      // Hide our window first (clear macOS lift level; paste path skips hideWindow fade)
      if (this.mainWindow) {
        if (process.platform === 'darwin') {
          this.mainWindow.setAlwaysOnTop(false);
        }
        this.mainWindow.hide();
      }

      // Small delay to ensure window is hidden
      await new Promise(resolve => setTimeout(resolve, 100));

      if (process.platform === 'darwin' && this.targetAppInfo?.bundleId) {
        const targetBundle = this.targetAppInfo.bundleId;

        // Validate bundle ID and skip invalid ones
        if (
          !targetBundle ||
          targetBundle === 'unknown' ||
          targetBundle === 'fallback' ||
          targetBundle === 'com.github.Electron' ||
          targetBundle === app.getName()
        ) {
          console.log('Invalid or LocalClip target app, using fallback paste');
          console.log('Content copied to clipboard (invalid target)');
          return;
        }

        // Focus the target app and paste
        const { exec } = require('child_process');
        const script = `
          tell application id "${targetBundle}"
            activate
          end tell
          delay 0.2
          tell application "System Events"
            keystroke "v" using command down
          end tell
        `;

        exec(`osascript -e '${script}'`, (error: any) => {
          if (error) {
            console.error('Error pasting to target app:', targetBundle, error);
            // Fallback: just copy to clipboard
            console.log('Fallback: Content copied to clipboard');
          } else {
            console.log('Successfully pasted to target app:', targetBundle);
          }
        });
      } else if (process.platform === 'win32' && this.targetAppInfo) {
        // Windows implementation - improved pasting
        const { exec } = require('child_process');

        // Give a moment for the window to be hidden and focus to return to target app
        setTimeout(() => {
          // Use PowerShell to send Ctrl+V to the currently focused window
          const script = `
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.SendKeys]::SendWait("^v")
          `;

          exec(
            `powershell -ExecutionPolicy Bypass -Command "${script}"`,
            (error: any) => {
              if (error) {
                console.error('Error pasting on Windows:', error);
                console.log('Trying Windows paste alternatives...');
                this.tryWindowsPasteAlternatives();
              } else {
                console.log(
                  'Successfully pasted on Windows to target app:',
                  this.targetAppInfo?.bundleId
                );
              }
            }
          );
        }, 300); // Longer delay to ensure focus returns to target app
      } else if (process.platform === 'linux' && this.targetAppInfo) {
        // Linux implementation - handle different desktop environments and display servers
        const { exec } = require('child_process');

        // Give a moment for the window to be hidden and focus to return to target app
        setTimeout(() => {
          // Try multiple pasting methods for different Linux environments

          // Method 1: Try xdotool (works on X11)
          exec('which xdotool', (whichError: Error | null) => {
            if (!whichError) {
              exec('xdotool key ctrl+v', (xdotoolError: Error | null) => {
                if (xdotoolError) {
                  console.log(
                    'xdotool paste failed, trying alternative methods'
                  );
                  this.tryLinuxPasteAlternatives();
                } else {
                  console.log(
                    'Successfully pasted on Linux using xdotool to target app:',
                    this.targetAppInfo?.bundleId
                  );
                }
              });
            } else {
              // xdotool not available, try alternatives
              this.tryLinuxPasteAlternatives();
            }
          });
        }, 300); // Longer delay to ensure focus returns to target app
      } else {
        // Fallback for other platforms or if no target app stored
        console.log('Content copied to clipboard (no target app available)');
      }

      // Re-enable clipboard monitoring after a short delay
      setTimeout(() => {
        this.clipboardMonitor.start();
      }, 500);
    } catch (error) {
      console.error('Error in pasteToTargetApp:', error);
      // Make sure to re-enable clipboard monitoring even if there's an error
      this.clipboardMonitor.start();
    }
  }

  private showSettings() {
    if (!this.mainWindow) {
      this.createWindow();
    }

    // Wait for window to be ready
    setTimeout(() => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('show-settings');
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    }, 100);
  }

  private showAbout() {
    if (!this.aboutWindow) {
      this.createAboutWindow();
    } else {
      this.aboutWindow.show();
      this.aboutWindow.focus();
    }
  }

  // Helper methods for rich text handling
  private extractTextFromHTML(html: string): string {
    try {
      // Basic HTML text extraction - remove HTML tags
      return html.replace(/<[^>]*>/g, '').trim();
    } catch (error) {
      console.error('Error extracting text from HTML:', error);
      return html;
    }
  }

  private extractTextFromRTF(rtf: string): string {
    try {
      // Basic RTF text extraction - remove RTF control codes
      let text = rtf
        .replace(/\\[a-z]+\d*\s?/g, '') // Remove RTF control words
        .replace(/[{}]/g, '') // Remove braces
        .replace(/\\\\/g, '\\') // Unescape backslashes
        .replace(/\\'/g, "'") // Unescape quotes
        .trim();

      return text;
    } catch (error) {
      console.error('Error extracting text from RTF:', error);
      return rtf;
    }
  }

  // Linux paste alternatives for different desktop environments
  private tryLinuxPasteAlternatives(): void {
    const { exec } = require('child_process');

    // Method 2: Try ydotool (works on Wayland)
    exec('which ydotool', (ydotoolWhichError: Error | null) => {
      if (!ydotoolWhichError) {
        exec('ydotool key ctrl+v', (ydotoolError: Error | null) => {
          if (ydotoolError) {
            console.log('ydotool paste failed, trying GNOME method');
            this.tryGnomePaste();
          } else {
            console.log(
              'Successfully pasted on Linux using ydotool to target app:',
              this.targetAppInfo?.bundleId
            );
          }
        });
      } else {
        // ydotool not available, try GNOME method
        this.tryGnomePaste();
      }
    });
  }

  // GNOME/Wayland specific paste method
  private tryGnomePaste(): void {
    const { exec } = require('child_process');

    // Method 3: Try gdbus for GNOME Shell
    exec(
      'gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "imports.ui.main.panel.statusArea.keyboard._keyboardController._keyboardManager.keyval_name = 65535"',
      (gnomeError: any) => {
        if (gnomeError) {
          console.log('GNOME paste method failed, trying KDE method');
          this.tryKdePaste();
        } else {
          // Simulate Ctrl+V via GNOME
          exec(
            'gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "imports.ui.main.keyboard._onKeyPress(null, {keyval: 118, state: 4})"',
            (gnomePasteError: any) => {
              if (gnomePasteError) {
                console.log('GNOME paste simulation failed, trying KDE method');
                this.tryKdePaste();
              } else {
                console.log(
                  'Successfully pasted on Linux using GNOME method to target app:',
                  this.targetAppInfo?.bundleId
                );
              }
            }
          );
        }
      }
    );
  }

  // KDE specific paste method
  private tryKdePaste(): void {
    const { exec } = require('child_process');

    // Method 4: Try KDE's kwriteconfig/qdbus
    exec('which qdbus', (qdbusWhichError: Error | null) => {
      if (!qdbusWhichError) {
        exec(
          'qdbus org.kde.kglobalaccel /component/kwin invokeShortcut "Paste"',
          (kdeError: Error | null) => {
            if (kdeError) {
              console.log('KDE paste method failed, using final fallback');
              this.tryFinalLinuxPasteFallback();
            } else {
              console.log(
                'Successfully pasted on Linux using KDE method to target app:',
                this.targetAppInfo?.bundleId
              );
            }
          }
        );
      } else {
        // qdbus not available, try final fallback
        this.tryFinalLinuxPasteFallback();
      }
    });
  }

  // Final fallback for Linux pasting
  private tryFinalLinuxPasteFallback(): void {
    const { exec } = require('child_process');

    // Method 5: Try generic X11 key simulation
    exec('which xte', (xteWhichError: Error | null) => {
      if (!xteWhichError) {
        exec(
          'xte "keydown Control_L" "key v" "keyup Control_L"',
          (xteError: Error | null) => {
            if (xteError) {
              console.log(
                'All Linux paste methods failed, content copied to clipboard'
              );
            } else {
              console.log(
                'Successfully pasted on Linux using xte to target app:',
                this.targetAppInfo?.bundleId
              );
            }
          }
        );
      } else {
        console.log(
          'All Linux paste methods failed, content copied to clipboard'
        );
      }
    });
  }

  // Enhanced Windows paste with multiple fallback methods
  private tryWindowsPasteAlternatives(): void {
    const { exec } = require('child_process');

    // Method 2: Try VBScript approach (more reliable on some systems)
    const vbScript = `
      Set WshShell = CreateObject("WScript.Shell")
      WshShell.SendKeys "^v"
    `;

    exec(`echo '${vbScript}' | cscript //nologo`, (vbError: any) => {
      if (vbError) {
        console.log('VBScript paste failed, trying .NET approach');
        this.tryDotNetPaste();
      } else {
        console.log(
          'Successfully pasted on Windows using VBScript to target app:',
          this.targetAppInfo?.bundleId
        );
      }
    });
  }

  // .NET approach for Windows pasting
  private tryDotNetPaste(): void {
    const { exec } = require('child_process');

    // Method 3: Try PowerShell with different execution policy
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("^v")
    `;

    exec(
      `powershell -ExecutionPolicy Bypass -Command "${script}"`,
      (dotnetError: any) => {
        if (dotnetError) {
          console.log(
            'All Windows paste methods failed, content copied to clipboard'
          );
        } else {
          console.log(
            'Successfully pasted on Windows using .NET method to target app:',
            this.targetAppInfo?.bundleId
          );
        }
      }
    );
  }

  // Linux-specific: Detect desktop environment and adjust behavior
  private detectLinuxDesktopEnvironment(): void {
    try {
      const desktopSession = process.env.DESKTOP_SESSION || '';
      const xdgCurrentDesktop = process.env.XDG_CURRENT_DESKTOP || '';
      const gdmSession = process.env.GDMSESSION || '';

      console.log('Linux Desktop Environment Detection:');
      console.log('  DESKTOP_SESSION:', desktopSession);
      console.log('  XDG_CURRENT_DESKTOP:', xdgCurrentDesktop);
      console.log('  GDMSESSION:', gdmSession);

      // Detect specific desktop environments
      if (
        xdgCurrentDesktop.toLowerCase().includes('gnome') ||
        desktopSession.toLowerCase().includes('gnome') ||
        gdmSession.toLowerCase().includes('gnome')
      ) {
        console.log('Detected GNOME desktop environment');
        this.setupGnomeSpecificFeatures();
      } else if (
        xdgCurrentDesktop.toLowerCase().includes('kde') ||
        desktopSession.toLowerCase().includes('kde') ||
        desktopSession.toLowerCase().includes('plasma')
      ) {
        console.log('Detected KDE/Plasma desktop environment');
        this.setupKdeSpecificFeatures();
      } else if (
        xdgCurrentDesktop.toLowerCase().includes('xfce') ||
        desktopSession.toLowerCase().includes('xfce')
      ) {
        console.log('Detected XFCE desktop environment');
        this.setupXfceSpecificFeatures();
      } else if (
        xdgCurrentDesktop.toLowerCase().includes('unity') ||
        desktopSession.toLowerCase().includes('unity')
      ) {
        console.log('Detected Unity desktop environment');
        this.setupUnitySpecificFeatures();
      } else {
        console.log('Unknown or generic desktop environment, using defaults');
        this.setupGenericLinuxFeatures();
      }

      // Detect display server
      if (process.env.WAYLAND_DISPLAY) {
        console.log('Detected Wayland display server');
      } else if (process.env.DISPLAY) {
        console.log('Detected X11 display server');
      } else {
        console.log('Unknown display server');
      }
    } catch (error) {
      console.error('Error detecting Linux desktop environment:', error);
      this.setupGenericLinuxFeatures();
    }
  }

  // GNOME-specific setup
  private setupGnomeSpecificFeatures(): void {
    console.log('Setting up GNOME-specific features...');
    // GNOME-specific tray icon adjustments could go here
  }

  // KDE-specific setup
  private setupKdeSpecificFeatures(): void {
    console.log('Setting up KDE-specific features...');
    // KDE-specific tray icon adjustments could go here
  }

  // XFCE-specific setup
  private setupXfceSpecificFeatures(): void {
    console.log('Setting up XFCE-specific features...');
    // XFCE-specific tray icon adjustments could go here
  }

  // Unity-specific setup
  private setupUnitySpecificFeatures(): void {
    console.log('Setting up Unity-specific features...');
    // Unity-specific tray icon adjustments could go here
  }

  // Generic Linux setup
  private setupGenericLinuxFeatures(): void {
    console.log('Setting up generic Linux features...');
    // Generic Linux tray icon adjustments could go here
  }
}

// Create app instance
new LocalClipApp();
