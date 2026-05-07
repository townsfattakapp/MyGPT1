import React, { useCallback, useEffect, useState } from 'react';
import Selecto from 'react-selecto';
import { X } from 'lucide-react';

type Rect = { x: number; y: number; width: number; height: number };

const waitForMainApi = () =>
  new Promise<boolean>((resolve) => {
    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;

      if (window.Main || attempts >= 20) {
        window.clearInterval(intervalId);
        resolve(Boolean(window.Main));
      }
    }, 100);
  });

export function AreaScreenshot({ onCapture, onCancel }: { onCapture: (blob: Blob) => void; onCancel: () => void }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isClosedExternally, setIsClosedExternally] = useState(false);

  // 1️⃣ Ask Electron to capture screen
  useEffect(() => {
    let active = true;

    const capture = async () => {
      console.log('📸 [AreaScreenshot] Initializing capture...');

      const isElectron = navigator.userAgent.toLowerCase().includes('electron');
      if (!isElectron) {
        console.error('❌ [AreaScreenshot] This feature only works in Electron, not in a web browser.');
        alert("Area Screenshot requires the Electron app to run. It won't work in a standard browser.");
        onCancel();
        return;
      }

      // Wait for window.Main to be available (useful for dev reloads)
      if (!window.Main) {
        console.warn('⏳ [AreaScreenshot] window.Main not found, waiting...');
        await waitForMainApi();
      }

      if (!window.Main) {
        console.error(
          '❌ [AreaScreenshot] window.Main is still undefined after waiting. Available window keys:',
          Object.keys(window).filter((k) => k.length < 20)
        );
        if (active) onCancel();
        return;
      }

      try {
        // Tell main process we are entering capture mode (resizes window)
        window.Main.setCaptureMode(true);

        // Wait for window to settle/resize (reduced from 400ms to 100ms)
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 100);
        });

        console.log('📸 [AreaScreenshot] Requesting screen sources...');
        // Capture at the actual display's native pixel resolution so small code stays crisp.
        const dpr = window.devicePixelRatio || 1;
        const nativeWidth = Math.round(window.screen.width * dpr);
        const nativeHeight = Math.round(window.screen.height * dpr);
        const thumbnailSize = {
          width: Math.max(nativeWidth, 2560),
          height: Math.max(nativeHeight, 1440)
        };
        console.log(
          `📸 [AreaScreenshot] Capture resolution: ${thumbnailSize.width}x${thumbnailSize.height} (DPR=${dpr})`
        );
        const sources = await window.Main.getDesktopSources({
          fetchThumbnail: true,
          thumbnailSize
        });

        if (!active) return;
        console.log(`📸 [AreaScreenshot] Found ${sources.length} sources.`);

        // First try to find "Entire screen" or similar, prioritizing 'screen:' IDs
        const screenSource =
          sources.find((s: any) => {
            const name = (s.name || '').toLowerCase();
            const id = (s.id || '').toLowerCase();
            return (name.includes('screen') || name.includes('entire')) && id.startsWith('screen:');
          }) ||
          sources.find((s: any) => {
            const name = (s.name || '').toLowerCase();
            return name.includes('screen') || name.includes('entire');
          }) ||
          sources[0];

        console.log(`🎯 [AreaScreenshot] Selected source: ${screenSource?.name} (${screenSource?.id})`);

        if (screenSource && screenSource.thumbnail) {
          console.log('✅ [AreaScreenshot] Received thumbnail, loading image...');
          const img = new Image();

          img.onload = () => {
            if (active) {
              console.log('✅ [AreaScreenshot] Image loaded:', img.width, 'x', img.height);
              setImage(img);
            }
          };

          img.onerror = (e) => {
            console.error('❌ [AreaScreenshot] Image load error:', e);
            if (active) {
              alert('Failed to load screen preview. Please try again.');
              onCancel();
            }
          };

          img.src = screenSource.thumbnail;
        } else {
          console.error('❌ [AreaScreenshot] No thumbnail found in sources');
          if (active) onCancel();
        }
      } catch (err) {
        console.error('❌ [AreaScreenshot] Failed during capture process:', err);
        if (active) onCancel();
      }
    };

    capture();

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsClosedExternally(true);
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      console.log('🧹 [AreaScreenshot] Component unmounting, cleaning up...');
      active = false;
      window.removeEventListener('keydown', handleEsc);
      if (window.Main) {
        window.Main.setCaptureMode(false);
      }
    };
  }, [onCancel]);

  // 2️⃣ Crop selected area
  const crop = useCallback(
    (selectedRect: Rect) => {
      if (!image) {
        console.warn('⚠️ [AreaScreenshot] Cannot crop: image is missing');
        return;
      }

      console.log('✂️ [AreaScreenshot] Cropping at:', selectedRect);

      const canvas = document.createElement('canvas');

      // Internal resolution of the image might differ from screen resolution
      // We need to map screen coordinates (rect) to image coordinates
      const scaleX = image.width / window.innerWidth;
      const scaleY = image.height / window.innerHeight;

      canvas.width = Math.max(1, Math.round(selectedRect.width * scaleX));
      canvas.height = Math.max(1, Math.round(selectedRect.height * scaleY));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('❌ [AreaScreenshot] Failed to create canvas context');
        return;
      }

      setIsCapturing(true);
      ctx.drawImage(
        image,
        selectedRect.x * scaleX,
        selectedRect.y * scaleY,
        selectedRect.width * scaleX,
        selectedRect.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob((blob) => {
        if (blob) {
          console.log('✅ [AreaScreenshot] Crop successful, size:', blob.size);
          setIsClosedExternally(true);
          onCapture(blob);
        } else {
          console.error('❌ [AreaScreenshot] Failed to create blob from canvas');
          setIsCapturing(false);
        }
      }, 'image/png');
    },
    [image, onCapture]
  );

  if (isClosedExternally) return null;

  if (!image) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[rgba(16,17,14,0.88)] text-[var(--matte-text)] backdrop-blur-sm">
        <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-[var(--matte-jade)] border-t-transparent" />
        <p className="mb-8 text-lg font-semibold tracking-wide text-[var(--matte-text-soft)]">Initializing Screen Capture...</p>

        <button
          onClick={() => {
            setIsClosedExternally(true);
            onCancel();
          }}
          className="header-chip is-danger"
        >
          <X size={15} />
          <span className="font-medium">Cancel Capture</span>
        </button>
      </div>
    );
  }

  return (
    <div className="area-screenshot-capture fixed inset-0 z-[9999] cursor-default select-none overflow-hidden bg-black touch-none">
      <img
        src={image.src}
        alt="Screen Capture"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
      />

      {/* Overlay to dim the unselected area */}
      <div className="pointer-events-none absolute inset-0 bg-black/48" />

      {!isCapturing && (
        <Selecto
          dragContainer=".area-screenshot-capture"
          selectableTargets={[]}
          dragCondition={(e) => e.inputEvent.button === 0}
          selectByClick={false}
          selectFromInside
          continueSelect={false}
          onSelectEnd={(e) => {
            const { left, top, width, height } = e.rect;
            if (width > 5 && height > 5) {
              crop({ x: left, y: top, width, height });
            }
          }}
        />
      )}

      {/* Instructions */}

      <div className="header-chip absolute left-4 top-4 bg-[rgba(16,17,14,0.74)] backdrop-blur-md">
        Drag to select an area
      </div>

      <button
        onClick={() => {
          setIsClosedExternally(true);
          onCancel();
        }}
        className="tool-button danger absolute right-4 top-4 backdrop-blur-md"
        title="Cancel capture"
      >
        <X size={18} />
      </button>
    </div>
  );
}
