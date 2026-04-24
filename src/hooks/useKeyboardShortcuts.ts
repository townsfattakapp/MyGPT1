import { useEffect } from 'react';

interface UseKeyboardShortcutsProps {
  isRecording: boolean;
  isInitializing: boolean;
  isProcessingScreenshot: boolean;
  isAreaCaptureMode: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTakeScreenshot: () => void;
  onEnterAreaCaptureMode: () => void;
}

export const useKeyboardShortcuts = ({
  isRecording,
  isInitializing,
  isProcessingScreenshot,
  isAreaCaptureMode,
  onStartRecording,
  onStopRecording,
  onTakeScreenshot,
  onEnterAreaCaptureMode
}: UseKeyboardShortcutsProps) => {

  // Restore persisted zoom on mount
  useEffect(() => {
    // Clear any leftover body zoom from the prior CSS-based approach.
    try { document.body.style.zoom = ''; } catch {}
    const saved = parseFloat(localStorage.getItem('appZoom') || '1');
    if (!isNaN(saved) && saved > 0) {
      if (window.Main?.setZoomFactor) {
        window.Main.setZoomFactor(saved);
      } else {
        (document.documentElement.style as any).zoom = String(saved);
      }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // console.log('🔑 [DEBUG] Key pressed:', e.key, 'Target:', (e.target as HTMLElement).tagName);

      const isTyping = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);
      
      // Window Movement (Arrow Keys)
      if (e.key.startsWith('Arrow')) {
        const direction = e.key.replace('Arrow', '').toLowerCase();
        // console.log(`🔑 [DEBUG] Arrow${direction} detected`);
        
        if (window.Main?.handleDirection) {
           e.preventDefault();
           window.Main.handleDirection(direction);
           // console.log(`⌨️ [RENDERER] Arrow ${direction} - Moving window`);
        }
        return;
      }

      // Zoom shortcuts (Ctrl + +/- and Ctrl + 0 to reset). Work even while typing.
      if (e.ctrlKey || e.metaKey) {
        const applyZoom = (factor: number) => {
          const clamped = Math.max(0.4, Math.min(3, +factor.toFixed(2)));
          if (window.Main?.setZoomFactor) {
            window.Main.setZoomFactor(clamped);
          } else {
            (document.documentElement.style as any).zoom = String(clamped);
          }
          localStorage.setItem('appZoom', String(clamped));
        };
        const currentZoom = () =>
          window.Main?.getZoomFactor
            ? window.Main.getZoomFactor()
            : parseFloat((document.documentElement.style as any).zoom || '1') || 1;

        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          applyZoom(currentZoom() + 0.1);
          return;
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          applyZoom(currentZoom() - 0.1);
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          applyZoom(1);
          return;
        }
      }

      // Block letter shortcuts if typing
      if (isTyping) return;

      const key = e.key.toLowerCase();

      if (key === 'l') {
        if (isRecording) {
          console.log('⌨️ [RENDERER] "L" pressed - Stopping recording');
          onStopRecording();
        } else if (!isInitializing) {
          console.log('⌨️ [RENDERER] "L" pressed - Starting recording');
          onStartRecording();
        }
      } else if (key === 'q') {
        if (!isProcessingScreenshot) {
            console.log('⌨️ [RENDERER] "Q" pressed - Taking screenshot');
            onTakeScreenshot();
        }
      } else if (key === 's') {
        if (!isAreaCaptureMode && !isProcessingScreenshot) {
            console.log('⌨️ [RENDERER] "S" pressed - Entering area capture mode');
            onEnterAreaCaptureMode();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isRecording, 
    isInitializing, 
    isProcessingScreenshot, 
    isAreaCaptureMode, 
    onStartRecording, 
    onStopRecording, 
    onTakeScreenshot, 
    onEnterAreaCaptureMode
  ]);
};
