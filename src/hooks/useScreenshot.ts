import { useState, useCallback, useEffect, useRef } from 'react';
import { createWorker } from 'tesseract.js';

interface UseScreenshotProps {
  onOCRComplete?: (text: string) => void;
  onImageCaptured?: (dataUrl: string) => void;
}

export const useScreenshot = ({ onOCRComplete, onImageCaptured }: UseScreenshotProps = {}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isAreaCaptureMode, setIsAreaCaptureMode] = useState(false);
  const ocrWorkerRef = useRef<Promise<Awaited<ReturnType<typeof createWorker>>> | null>(null);

  const getOCRWorker = useCallback(() => {
    if (!ocrWorkerRef.current) {
      ocrWorkerRef.current = createWorker('eng').catch((error) => {
        ocrWorkerRef.current = null;
        throw error;
      });
    }

    return ocrWorkerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      const workerPromise = ocrWorkerRef.current;
      ocrWorkerRef.current = null;
      workerPromise
        ?.then((worker) => worker.terminate())
        .catch((error) => console.error('OCR worker cleanup error:', error));
    };
  }, []);

  const performOCR = useCallback(
    async (imageDataUrl: string) => {
      console.log('🔍 Performing OCR...');
      setIsProcessing(true);

      try {
        const worker = await getOCRWorker();
        const ret = await worker.recognize(imageDataUrl);
        console.log('OCR Text:', ret.data.text);

        if (ret.data.text && ret.data.text.trim()) {
          const text = `Screenshot Text:\n${ret.data.text}`;
          if (onOCRComplete) onOCRComplete(text);
        } else {
          console.log('⚠️ No text found in screenshot');
        }
      } catch (error) {
        console.error('OCR Error:', error);
      } finally {
        setIsProcessing(false);
      }
    },
    [getOCRWorker, onOCRComplete]
  );

  const takeFullScreenScreenshot = useCallback(async () => {
    console.log('📸 Taking screenshot...');
    if (isProcessing) return;

    setIsProcessing(true);
    let stream: MediaStream | null = null;

    try {
      if (!window.Main?.getDesktopSources) {
        console.error('Screenshot capture is only available in Electron');
        return;
      }

      // Get sources
      const sources = await window.Main.getDesktopSources();
      const screenSource =
        sources.find((s: any) => s.name.includes('Screen') || s.name.includes('Entire Screen')) || sources[0];

      if (!screenSource) {
        console.error('No screen source found');
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id,
            minWidth: 1280,
            maxWidth: 4000,
            minHeight: 720,
            maxHeight: 4000
          }
        } as any
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Unable to load screen capture stream'));
      });

      await video.play();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Unable to create screenshot canvas context');
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageDataUrl = canvas.toDataURL('image/png');
      console.log('✅ Full screen screenshot captured successfully!');

      await performOCR(imageDataUrl);
    } catch (error) {
      console.error('Error taking screenshot:', error);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setIsProcessing(false);
    }
  }, [isProcessing, performOCR]);

  const captureForDownload = useCallback(async () => {
    console.log('⬇️ Taking screenshot for download...');
    try {
      const sources = await window.Main.getDesktopSources({
        fetchThumbnail: true,
        thumbnailSize: { width: 1920, height: 1080 }
      });

      const screenSource =
        sources.find((s: any) => s.name.includes('Screen') || s.name.includes('Entire Screen')) || sources[0];

      if (screenSource && screenSource.thumbnail) {
        setScreenshotDataUrl(screenSource.thumbnail);
        setShowModal(true);
      }
    } catch (error) {
      console.error('❌ Error taking screenshot:', error);
    }
  }, []);

  const closeScreenshotModal = useCallback(() => {
    setShowModal(false);
    setScreenshotDataUrl(null);
  }, []);

  const downloadScreenshot = useCallback(() => {
    if (screenshotDataUrl) {
      const link = document.createElement('a');
      link.href = screenshotDataUrl;
      link.download = `screenshot-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('✅ Screenshot download initiated');
    }
  }, [screenshotDataUrl]);

  // For Area Screenshot component interaction
  const handleAreaCapture = useCallback(
    (dataUrl: string) => {
      setIsAreaCaptureMode(false);
      if (onImageCaptured) {
        onImageCaptured(dataUrl);
      }
    },
    [onImageCaptured]
  );

  return {
    isProcessing,
    isAreaCaptureMode,
    setIsAreaCaptureMode,
    showModal,
    screenshotDataUrl,
    takeFullScreenScreenshot,
    captureForDownload,
    downloadScreenshot,
    closeScreenshotModal,
    handleAreaCapture
  };
};
