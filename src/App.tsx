import React, { useEffect } from 'react';

import ChatUI from './components/ChatUI';
import { useStealthMode } from './hooks/useStealthMode';

function App() {
  const { isStealth, concealMode, protectedModeActive, requestSecureRestore } = useStealthMode();

  useEffect(() => {
    window?.Main?.removeLoading();
  }, []);

  const handleMove = (direction: string) => {
    window?.Main?.handleDirection(direction);
  };

  // Handle arrow key presses
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const direction = event.key.replace('Arrow', '').toLowerCase();
        handleMove(direction);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showOverlayPlaceholder = isStealth === true && concealMode === 'overlay';
  const protectedEnabled = protectedModeActive === true;

  const revealFromOverlay = async () => {
    const ok = window.confirm(
      'Are you sure you want to show the app? It may be visible on screen share.'
    );
    if (!ok) return;
    await requestSecureRestore(false, 'overlay-panel');
  };

  return (
    <div className="relative flex flex-col h-screen">
      {/* Stealth Mode Banner */}
      {isStealth === true && (
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white px-4 py-2 text-sm font-medium shadow-lg z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="animate-pulse">🕶️</span>
              <span>Stealth Mode Active - Hidden from screen sharing</span>
            </div>
            <div className="text-xs opacity-90">
              Press Ctrl+Shift+S or Ctrl+Alt+S to show
            </div>
          </div>
        </div>
      )}

      <ChatUI />
      {showOverlayPlaceholder && (
        <div className="absolute inset-0 z-[10000] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-slate-100">
          <div className="text-lg font-semibold tracking-wide">Protected Privacy Overlay</div>
          <div className="text-sm text-slate-300 text-center max-w-md px-6">
            Sensitive content is hidden while sharing. Use Secure Show to restore the full app.
          </div>
          <button
            onClick={revealFromOverlay}
            className="px-4 py-2 rounded-lg bg-blue-600/30 border border-blue-300/50 text-blue-100 hover:bg-blue-600/40 text-sm font-medium"
          >
            Secure Show App
          </button>
          <div className="text-xs text-slate-400">
            Shortcut: Ctrl+Shift+S {protectedEnabled ? '(confirmation required)' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
