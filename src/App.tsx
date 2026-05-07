import React, { useEffect } from 'react';
import { EyeOff, Lock } from 'lucide-react';

import ChatUI from './components/ChatUI';
import { useStealthMode } from './hooks/useStealthMode';

function App() {
  const { isStealth, concealMode, requestSecureRestore } = useStealthMode();

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
        <div className="z-10 border-b border-[var(--matte-jade-border)] bg-[var(--matte-jade-soft)] px-4 py-2 text-sm font-medium text-[#c9eadf]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EyeOff size={16} />
              <span>Stealth Mode Active - Hidden from screen sharing</span>
            </div>
          </div>
        </div>
      )}

      <ChatUI />
      {showOverlayPlaceholder && (
        <div className="absolute inset-0 z-[10000] flex flex-col items-center justify-center gap-4 bg-[rgba(16,17,14,0.96)] text-[var(--matte-text)] backdrop-blur-md">
          <Lock size={24} className="text-[#c9eadf]" />
          <div className="text-lg font-semibold tracking-wide">Protected Privacy Overlay</div>
          <div className="max-w-md px-6 text-center text-sm text-[var(--matte-text-soft)]">
            Sensitive content is hidden while sharing. Use Secure Show to restore the full app.
          </div>
          <button
            onClick={revealFromOverlay}
            className="header-chip is-on"
          >
            Secure Show App
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
