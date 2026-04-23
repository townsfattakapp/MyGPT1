// Native
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Packages
import {
  BrowserWindow,
  app,
  ipcMain,
  IpcMainEvent,
  nativeTheme,
  screen,
  desktopCapturer,
  systemPreferences,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  dialog
} from 'electron';
import isDev from 'electron-is-dev';

/* --------------------------------------------------------------------------
   MODULE-SCOPE STATE
   Lifted out of createWindow() so tray, shortcuts, and IPC handlers can all
   share the same stealth logic and window reference. This is what makes the
   "always-restorable" contract possible.
---------------------------------------------------------------------------*/
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let stealthActive = false;
let protectedModeActive = false;
let stealthConcealMode: StealthConcealMode = 'hide';
let prevAlwaysOnTop = true;
const hideFromTaskbarWhenStealth = true;

const STEALTH_HIDE_SHORTCUT = 'CommandOrControl+Shift+H';
const STEALTH_SHOW_SHORTCUT = 'CommandOrControl+Shift+S';
const STEALTH_SHOW_SHORTCUT_ALT = 'CommandOrControl+Alt+S';
type StealthConcealMode = 'hide' | 'overlay';

interface PrivacyState {
  stealthActive: boolean;
  protectedModeActive: boolean;
  concealMode: StealthConcealMode;
}

function getPrivacyState(): PrivacyState {
  return {
    stealthActive,
    protectedModeActive,
    concealMode: stealthConcealMode
  };
}

function showWindowWithFallback(win: BrowserWindow) {
  let shown = false;
  try {
    win.show();
    shown = true;
  } catch (e) {
    console.warn('show() failed, trying showInactive():', e);
  }
  if (!shown) {
    try {
      win.showInactive();
      shown = true;
    } catch (e) {
      console.error('❌ [MAIN] Both show() and showInactive() failed:', e);
    }
  }
}

function applyStealthVisualState(win: BrowserWindow) {
  if (stealthConcealMode === 'hide') {
    try { win.setSkipTaskbar(hideFromTaskbarWhenStealth); } catch (e) { console.warn('setSkipTaskbar failed:', e); }
    if (win.isVisible()) {
      try { win.hide(); } catch (e) { console.warn('hide() failed:', e); }
    }
    return;
  }

  // Overlay mode keeps the window visible, but renderer swaps to neutral UI.
  try { win.setSkipTaskbar(false); } catch (e) { console.warn('setSkipTaskbar failed:', e); }
  if (!win.isVisible()) showWindowWithFallback(win);
}

async function confirmRestore(source: string) {
  const sourceLabel = source.trim() || 'unknown source';
  try {
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: 'Confirm Restore',
      message: 'Are you sure you want to show the app? It may be visible on screen share.',
      detail: `Restore request source: ${sourceLabel}`,
      buttons: ['Show App', 'Keep Hidden'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    return result.response === 0;
  } catch (e) {
    // Never risk lockout if the platform fails to draw a dialog.
    console.error('❌ [MAIN] Restore confirmation dialog failed. Failing open:', e);
    return true;
  }
}

async function requestSecureRestore(source: string, requireConfirmation = true) {
  if (!stealthActive) {
    forceRestore();
    return true;
  }

  if (requireConfirmation) {
    const confirmed = await confirmRestore(source);
    if (!confirmed) {
      console.log('🛡️ [MAIN] Secure restore cancelled by user');
      return false;
    }
  }

  forceRestore();
  return true;
}

/**
 * SINGLE broadcast channel for stealth state changes.
 *
 * Every mutation of `stealthActive` must call this so that:
 *   1. The renderer's `stealth-changed` listener fires
 *   2. The tray menu label + tooltip stay in sync
 * Never `webContents.send('stealth-changed', ...)` inline — always go through here.
 */
function broadcastStealth() {
  const state = getPrivacyState();
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    try {
      // Legacy event for existing renderer listeners.
      win.webContents.send('stealth-changed', state.stealthActive);
      // Fine-grained events + unified state payload.
      win.webContents.send('protected-mode-changed', state.protectedModeActive);
      win.webContents.send('stealth-conceal-mode-changed', state.concealMode);
      win.webContents.send('privacy-state-changed', state);
    } catch (e) {
      console.warn('broadcastStealth send failed:', e);
    }
  }
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  try {
    const menu = Menu.buildFromTemplate([
      { label: 'Show App (Secure)', click: () => { void requestSecureRestore('tray-menu', true); } },
      {
        label: stealthActive
          ? (protectedModeActive ? 'Disable Stealth (locked by Protected Mode)' : 'Disable Stealth')
          : `Enable Stealth (${stealthConcealMode === 'hide' ? 'hide' : 'overlay'})`,
        click: () => {
          if (stealthActive) {
            if (protectedModeActive) {
              console.log('🛡️ [MAIN] Tray restore blocked: Protected Mode is enabled');
              return;
            }
            forceRestore();
          } else {
            setStealth(true);
          }
        }
      },
      {
        label: `Protected Mode: ${protectedModeActive ? 'ON' : 'OFF'}`,
        click: () => setProtectedMode(!protectedModeActive)
      },
      {
        label: 'Conceal Mode',
        submenu: [
          {
            label: 'Full Hide',
            type: 'radio',
            checked: stealthConcealMode === 'hide',
            click: () => setStealthConcealMode('hide')
          },
          {
            label: 'Overlay Placeholder',
            type: 'radio',
            checked: stealthConcealMode === 'overlay',
            click: () => setStealthConcealMode('overlay')
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          if (tray) {
            try { tray.destroy(); } catch {}
            tray = null;
          }
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(menu);
    const stealthLabel = stealthActive
      ? `Stealth ON (${stealthConcealMode === 'hide' ? 'hidden' : 'overlay'})`
      : 'Stealth OFF';
    const protectedLabel = protectedModeActive ? 'Protected ON' : 'Protected OFF';
    tray.setToolTip(`myGPT — ${stealthLabel} • ${protectedLabel}`);
  } catch (e) {
    console.warn('refreshTrayMenu failed:', e);
  }
}

function setProtectedMode(enable: boolean) {
  if (protectedModeActive === enable) return;
  protectedModeActive = enable;
  broadcastStealth();
  console.log(`🛡️  [MAIN] Protected Mode ${enable ? 'ENABLED' : 'DISABLED'}`);
}

function setStealthConcealMode(mode: StealthConcealMode) {
  if (stealthConcealMode === mode) return;
  stealthConcealMode = mode;

  const win = mainWindow;
  if (stealthActive && win && !win.isDestroyed()) {
    try {
      applyStealthVisualState(win);
    } catch (e) {
      console.error('❌ [MAIN] Applying conceal mode failed:', e);
    }
  }

  broadcastStealth();
  console.log(`🎭 [MAIN] Conceal mode set to ${mode}`);
}

/**
 * forceRestore — the "emergency exit" used by the tray, Ctrl+Shift+S, and
 * DisableStealth(). Engineered to bring the window back under every
 * condition I could think of on Windows/macOS/Linux.
 */
function forceRestore() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    console.warn('⚠️  [MAIN] forceRestore called but window is destroyed');
    return;
  }

  // 1. Make it reappear in the taskbar
  try { win.setSkipTaskbar(false); } catch (e) { console.warn('setSkipTaskbar failed:', e); }

  // 2. If the OS minimized it, un-minimize first
  try { if (win.isMinimized()) win.restore(); } catch (e) { console.warn('restore failed:', e); }

  // 3. If the window drifted off-screen (rare but catastrophic), pull it back
  try {
    const displays = screen.getAllDisplays();
    const bounds = win.getBounds();
    const onScreen = displays.some((d) => {
      const wa = d.workArea;
      return (
        bounds.x + bounds.width > wa.x &&
        bounds.x < wa.x + wa.width &&
        bounds.y + bounds.height > wa.y &&
        bounds.y < wa.y + wa.height
      );
    });
    if (!onScreen) {
      const primary = screen.getPrimaryDisplay().workArea;
      console.warn('⚠️  [MAIN] Window was off-screen, repositioning to primary display');
      win.setBounds({ x: primary.x + 100, y: primary.y + 100, width: 700, height: 700 });
    }
  } catch (e) {
    console.warn('off-screen check failed:', e);
  }

  // 4. Show, with Linux/Wayland-friendly fallback to showInactive()
  showWindowWithFallback(win);

  // 5. Try to bring it to the foreground (needed on GNOME/Wayland)
  try { win.moveTop(); } catch {}
  try { win.focus(); } catch {}

  // 6. Restore always-on-top if it was on before stealth
  if (prevAlwaysOnTop) {
    try { win.setAlwaysOnTop(true, 'screen-saver'); } catch (e) { console.warn('setAlwaysOnTop failed:', e); }
  }

  stealthActive = false;
  broadcastStealth();

  // 7. Re-register shortcuts defensively — if Linux ever drops them, this
  //    ensures Ctrl+Shift+S keeps working for the next cycle.
  registerStealthShortcuts();

  console.log('👁️  [MAIN] forceRestore executed — window should now be visible');
}

function setStealth(enable: boolean) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;

  if (enable) {
    if (stealthActive) return;
    try {
      prevAlwaysOnTop = win.isAlwaysOnTop();
      win.setAlwaysOnTop(false);
      stealthActive = true;
      applyStealthVisualState(win);
      broadcastStealth();
      console.log(`🕶️  [MAIN] Stealth ENABLED (${stealthConcealMode})`);
    } catch (e) {
      console.error('❌ [MAIN] Stealth enable failed:', e);
      // If anything went wrong, reconcile: we're effectively not stealthed.
      stealthActive = false;
      broadcastStealth();
    }
  } else {
    forceRestore();
  }
}

/**
 * Idempotent shortcut registration. Safe to call multiple times.
 * Returns true if both shortcuts registered successfully.
 */
function registerStealthShortcuts(): boolean {
  try {
    if (globalShortcut.isRegistered(STEALTH_HIDE_SHORTCUT)) {
      globalShortcut.unregister(STEALTH_HIDE_SHORTCUT);
    }
    if (globalShortcut.isRegistered(STEALTH_SHOW_SHORTCUT)) {
      globalShortcut.unregister(STEALTH_SHOW_SHORTCUT);
    }
  } catch {}

  const ok1 = globalShortcut.register(STEALTH_HIDE_SHORTCUT, () => setStealth(true));
  const ok2 = globalShortcut.register(STEALTH_SHOW_SHORTCUT, () => { void requestSecureRestore('keyboard-shortcut', true); });
  const ok3 = globalShortcut.register(STEALTH_SHOW_SHORTCUT_ALT, () => { void requestSecureRestore('keyboard-shortcut', true); });
  console.log(`⌨️  [MAIN] Stealth shortcuts — hide (${STEALTH_HIDE_SHORTCUT}): ${ok1}, restore (${STEALTH_SHOW_SHORTCUT}): ${ok2}, restore-alt (${STEALTH_SHOW_SHORTCUT_ALT}): ${ok3}`);
  if (!ok1 || !ok2 || !ok3) {
    console.warn('⚠️  [MAIN] Shortcut registration partial — tray icon is your fallback.');
  }
  return ok1 && ok2 && ok3;
}

/**
 * createTray — the UNCONDITIONAL fallback. Even if shortcuts fail, clicking
 * the tray icon (or its context menu) always brings the app back.
 * On Ubuntu GNOME, users may need the AppIndicator extension installed.
 */
function createTray() {
  if (tray) return;

  // Minimal 32×32 PNG (the same icon that was stubbed in previously)
  const iconDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAc0lEQVRYhe3WMQ6AIAyF4T9eQT0AeAAv4Em8gCfR2bCyOhkHY2K0hZbwJ0zAwNeXtqRSShARLAHWACwLsAFgs3HEJh2w0rprqvX0aBzTB2j4N2AF0MgaQASobRZ7gV0AdoHYCXABawJ2AmwCqAJIAKwCJIAEwA0BYwDlEQpRWAAAAABJRU5ErkJggg==';
  const icon = nativeImage.createFromDataURL(iconDataUrl);

  try {
    tray = new Tray(icon);
  } catch (e) {
    console.error('❌ [MAIN] Tray creation failed:', e);
    console.warn('⚠️  [MAIN] On Ubuntu GNOME, install the AppIndicator extension for tray support.');
    return;
  }

  // Initial menu + tooltip. All future updates go through refreshTrayMenu()
  // which is called from broadcastStealth() — keeps the tray label in sync no
  // matter how stealth was triggered (IPC, shortcut, tray itself).
  refreshTrayMenu();
  tray.on('click', () => { void requestSecureRestore('tray-click', true); });
  tray.on('double-click', () => { void requestSecureRestore('tray-double-click', true); });
}

async function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  // Create the browser window.
  const window = new BrowserWindow({
    width: 700,
    height: 700,
    x: Math.floor(width), // Position around the center
    y: 10, // At the top of the screen
    //  change to false to use AppBar
    frame: true,
    show: true,
    resizable: true,  // Enable window resizing
    fullscreenable: true,

    transparent: false, // Enable transparency
    vibrancy: 'tooltip', // macOS glass effect
    visualEffectState: 'active',
    backgroundColor: '#ffffff', // Start fully transparent

    alwaysOnTop: true,
    hasShadow: true,
    enableLargerThanScreen: true,
    roundedCorners: true,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), // Use .cjs
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Disable sandbox in development
      webSecurity: false // Disable web security in development
    }
  });

  // Expose the window reference to module-scope stealth logic.
  mainWindow = window;

  const preloadPath = join(__dirname, 'preload.cjs');
  console.log('🔧 [MAIN] Preload path:', preloadPath);
  console.log('🔧 [MAIN] __dirname:', __dirname);

  // Check if preload file exists
  const fs = await import('fs');
  const preloadExists = fs.existsSync(preloadPath);
  console.log('🔧 [MAIN] Preload file exists:', preloadExists);
  if (!preloadExists) {
    console.error('❌ [MAIN] Preload file NOT FOUND at:', preloadPath);
  }

  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Hide window from screen capture/sharing.
  // NOTE: This is a no-op on Linux (neither X11 nor Wayland expose an
  // equivalent to Windows' SetWindowDisplayAffinity / macOS sharingType).
  // On Linux, you MUST use full stealth hide (Ctrl+Shift+H) to avoid capture.
  window.setContentProtection(true);
  if (process.platform === 'linux') {
    console.warn(
      '⚠️  [MAIN] setContentProtection() is a no-op on Linux.\n' +
      '    The window WILL be visible in screen shares while shown.\n' +
      '    Use Ctrl+Shift+H to enable full Stealth Mode before sharing.'
    );
  } else {
    console.log(`✅ [MAIN] Content protection active on ${process.platform} — window hidden from screen capture.`);
  }
  // window.webContents.openDevTools();

  // Check permissions on macOS
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    console.log('🎤 [MAIN] Microphone access status:', micStatus);

    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log('🖥️ [MAIN] Screen recording access status:', screenStatus);

    if (micStatus !== 'granted') {
      // This might trigger a system prompt
      systemPreferences.askForMediaAccess('microphone').then((granted: boolean) => {
        console.log('🎤 [MAIN] Microphone access requested. Granted:', granted);
      });
    }
  }

  // Log when preload script should have loaded + push current stealth state.
  // This is the defensive re-sync: guarantees the renderer gets a fresh value
  // after every reload / HMR, without relying on its mount-time IPC invoke.
  window.webContents.on('did-finish-load', () => {
    console.log('✅ [MAIN] Page finished loading');
    broadcastStealth();
  });

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('❌ [MAIN] Preload error:', { preloadPath, error });
  });
  // window.setContentProtection(true);
  const port = process.env.PORT || 5421;
  const url = isDev ? `http://localhost:${port}` : join(__dirname, '../dist-vite/index.html');

  // and load the index.html of the app.
  if (isDev) {
    window?.loadURL(url);
  } else {
    window?.loadFile(url);
  }

  // Open the DevTools.
  // window.webContents.openDevTools();

  ipcMain.on('move-window', (_event, direction) => {
    if (!window) return;
    // console.log(direction);
    // window.setBounds({ x: 0, y: 0, width: 400, height: 400 });
    const { x, y } = window.getBounds();

    // // Adjust the movement step size
    const step = 150;

    // console.log(x, y, direction);

    switch (direction) {
      case 'left':
        window.setBounds({ x: x - step, y });
        break;
      case 'right':
        window.setBounds({ x: x + step, y });
        break;
      case 'up':
        window.setBounds({ x, y: y - step });
        break;
      case 'down':
        window.setBounds({ x, y: y + step });
        break;

      default:
    }
  });

  // For AppBar
  ipcMain.on('minimize', () => {
    // eslint-disable-next-line no-unused-expressions
    window.isMinimized() ? window.restore() : window.minimize();
    // or alternatively: win.isVisible() ? win.hide() : win.show()
  });
  ipcMain.on('maximize', () => {
    // eslint-disable-next-line no-unused-expressions
    window.isMaximized() ? window.restore() : window.maximize();
  });

  ipcMain.on('close', () => {
    window.close();
  });

  ipcMain.on('set-capture-mode', (_event, isCaptureMode) => {
    if (!window) return;
    console.log(`🖥️ [MAIN] set-capture-mode: ${isCaptureMode} (Window size preserved)`);
    try {
      if (isCaptureMode) {
        // Keep window same size, just ensure it's on top for the selection process
        window.setAlwaysOnTop(true, 'screen-saver');
        console.log('✅ [MAIN] Window kept at current size for selection');
      } else {
        // Keep it always on top even after capture
        window.setAlwaysOnTop(true, 'screen-saver');
        console.log('✅ [MAIN] Window capture mode finished');
      }
    } catch (err) {
      console.error('❌ [MAIN] Error changing window capture mode:', err);
    }
  });

  /* --------------------------------------------------------------
     STEALTH MODE — wired to module-level setStealth/forceRestore so
     the tray icon can reach them as an emergency exit.
  ---------------------------------------------------------------*/
  ipcMain.on('stealth-enable', () => setStealth(true));
  ipcMain.on('stealth-disable', () => {
    if (stealthActive && protectedModeActive) {
      console.log('🛡️ [MAIN] Restore blocked: Protected Mode requires secure restore');
      return;
    }
    forceRestore();
  });
  ipcMain.on('stealth-toggle', () => {
    if (stealthActive) {
      if (protectedModeActive) {
        console.log('🛡️ [MAIN] Toggle restore ignored: Protected Mode is enabled');
        return;
      }
      forceRestore();
    } else {
      setStealth(true);
    }
  });

  ipcMain.on('protected-mode-set', (_event, enable: boolean) => {
    setProtectedMode(Boolean(enable));
  });
  ipcMain.on('protected-mode-toggle', () => {
    setProtectedMode(!protectedModeActive);
  });

  ipcMain.on('stealth-conceal-mode-set', (_event, mode: StealthConcealMode) => {
    if (mode !== 'hide' && mode !== 'overlay') return;
    setStealthConcealMode(mode);
  });

  ipcMain.handle('stealth-status', () => stealthActive);
  ipcMain.handle('protected-mode-status', () => protectedModeActive);
  ipcMain.handle('stealth-conceal-mode-status', () => stealthConcealMode);
  ipcMain.handle('privacy-state', () => getPrivacyState());
  ipcMain.handle(
    'stealth-secure-restore',
    async (_event, options?: { source?: string; requireConfirmation?: boolean }) => {
      const source = options?.source ?? 'renderer';
      const requireConfirmation = options?.requireConfirmation !== false;
      return requestSecureRestore(source, requireConfirmation);
    }
  );

  registerStealthShortcuts();
  createTray();

  // If the window is closed mid-stealth, clean up so we don't leak.
  window.on('closed', () => {
    mainWindow = null;
    if (tray) {
      try { tray.destroy(); } catch {}
      tray = null;
    }
    try { globalShortcut.unregister(STEALTH_HIDE_SHORTCUT); } catch {}
    try { globalShortcut.unregister(STEALTH_SHOW_SHORTCUT); } catch {}
  });

  nativeTheme.themeSource = 'dark';
}

ipcMain.handle('get-platform-info', () => ({
  platform: process.platform,
  // setContentProtection only works on win32 and darwin.
  contentProtectionSupported: process.platform === 'win32' || process.platform === 'darwin'
}));

ipcMain.handle(
  'get-desktop-sources',
  async (_event, options?: { fetchThumbnail?: boolean; thumbnailSize?: Electron.Size }) => {
    console.log('🎯 [MAIN] get-desktop-sources handler called with options:', options);
    try {
      console.log('📡 [MAIN] Requesting desktop sources with types: [screen]');
      // Use larger thumbnail size if not specified but fetching thumbnail
      const thumbnailSize = options?.thumbnailSize || { width: 1080, height: 720 };
      const fetchThumbnail = options?.fetchThumbnail || false;

      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: fetchThumbnail ? thumbnailSize : { width: 0, height: 0 }
      });

      console.log(
        `✅ [MAIN] Found ${sources.length} sources:`,
        sources.map((s) => ({ id: s.id, name: s.name }))
      );

      const result = sources.map((source) => ({
        id: source.id,
        name: source.name,
        // Only include thumbnail if requested to avoid overhead
        thumbnail: fetchThumbnail ? source.thumbnail.toDataURL() : undefined
      }));

      console.log(`📤 [MAIN] Returning sources to renderer. Thumbnails included: ${fetchThumbnail}`);
      return result;
    } catch (error) {
      console.error('❌ [MAIN] Error getting desktop sources:', error);
      throw error;
    }
  }
);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// let tray;

app.whenReady().then(() => {
  // const icon = nativeImage.createFromDataURL(
  //   'data:image/png;base64,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'
  // );
  // tray = new Tray(icon);
  // const contextMenu = Menu.buildFromTemplate([
  //   { label: 'Item1', type: 'radio' },
  //   { label: 'Item2', type: 'radio' },
  //   { label: 'Item3', type: 'radio', checked: true },
  //   { label: 'Item4', type: 'radio' }
  // ]);
  // tray.setToolTip('This is my application.');
  // tray.setContextMenu(contextMenu);
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// listen the channel `message` and resend the received message to the renderer process
ipcMain.on('message', (event: IpcMainEvent, message: any) => {
  console.log(message);
  setTimeout(() => event.sender.send('message', 'common.hiElectron'), 500);
});
