import { useCallback, useEffect, useState } from 'react';
import type { PrivacyState, StealthConcealMode } from '../types/electron';

export interface PlatformInfo {
  platform: string;
  contentProtectionSupported: boolean;
}

/**
 * Stealth Mode — single source of truth is the Electron main process.
 *
 * Data flow:
 *   - On mount: fetch current state via GetPrivacyState()
 *   - Live: subscribe to onPrivacyStateChange (main broadcasts on every mutation)
 *   - Defensive: re-pull state on window focus / visibility change in case
 *     a broadcast was missed (hot reload, subscription timing)
 *
 * The hook never toggles local state itself — buttons call the IPC methods
 * and wait for the main-process broadcast to come back. This is what keeps
 * the UI and the main-process boolean aligned.
 */
export const useStealthMode = () => {
  const [privacyState, setPrivacyState] = useState<PrivacyState | null>(null);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);

  useEffect(() => {
    if (!window.Main) return;
    let isDisposed = false;
    let statusReadVersion = 0;

    const refresh = () => {
      const readVersion = ++statusReadVersion;
      window.Main.GetPrivacyState()
        .then((state) => {
          // Ignore stale async reads that completed after a newer push/read.
          if (!isDisposed && readVersion === statusReadVersion) {
            setPrivacyState(state);
          }
        })
        .catch(() => {});
    };

    // 1. Subscribe to pushes from main first so they can never be missed.
    const unsubscribe = window.Main.onPrivacyStateChange((state) => {
      // Invalidate older in-flight reads so push events stay authoritative.
      statusReadVersion += 1;
      if (!isDisposed) setPrivacyState(state);
    });

    // 2. Initial pull
    refresh();
    window.Main.getPlatformInfo().then((info) => {
      if (!isDisposed) setPlatform(info);
    }).catch(() => {});

    // 3. Defensive re-pull on focus / visibility change
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isDisposed = true;
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Buttons only call IPC — they never flip local state. The UI only updates
  // when the main process broadcasts back, which is the source of truth.
  const enable = useCallback(() => window.Main?.EnableStealth(), []);
  const disable = useCallback(() => window.Main?.DisableStealth(), []);
  const toggle = useCallback(() => window.Main?.ToggleStealth(), []);
  const setProtectedMode = useCallback((enableProtected: boolean) => {
    window.Main?.SetProtectedMode(enableProtected);
  }, []);
  const toggleProtectedMode = useCallback(() => window.Main?.ToggleProtectedMode(), []);
  const setConcealMode = useCallback((mode: StealthConcealMode) => {
    window.Main?.SetStealthConcealMode(mode);
  }, []);
  const requestSecureRestore = useCallback(
    (requireConfirmation = true, source = 'renderer-ui') => {
      if (!window.Main) return Promise.resolve(false);
      return window.Main.RequestSecureRestore({ requireConfirmation, source });
    },
    []
  );

  const isStealth = privacyState?.stealthActive ?? null;
  const protectedModeActive = privacyState?.protectedModeActive ?? null;
  const concealMode = privacyState?.concealMode ?? null;
  const privacyKnown = privacyState !== null;

  return {
    privacyState,
    privacyKnown,
    isStealth,
    protectedModeActive,
    concealMode,
    platform,
    enable,
    disable,
    toggle,
    setProtectedMode,
    toggleProtectedMode,
    setConcealMode,
    requestSecureRestore
  };
};
