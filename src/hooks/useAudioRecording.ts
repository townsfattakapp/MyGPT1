import { useState, useRef, useCallback } from 'react';
import type { AIProvider } from '../services/aiProvider';

interface UseAudioRecordingProps {
  onTranscriptionComplete: (text: string) => void;
  provider?: AIProvider;
}

// Provider → Whisper endpoint. Groq hosts whisper-large-v3 for free; OpenAI-compatible payload.
// Providers without audio (gemini, deepseek) fall back to OpenAI Whisper if a key is set,
// else Groq Whisper if a Groq key is set.
const resolveWhisperEndpoint = (provider: AIProvider | undefined) => {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const groqKey = import.meta.env.VITE_GROQ_API_KEY;

  if (provider === 'groq' && groqKey) {
    return {
      url: 'https://api.groq.com/openai/v1/audio/transcriptions',
      key: groqKey,
      model: 'whisper-large-v3'
    };
  }
  if (provider === 'openai' && openaiKey) {
    return {
      url: 'https://api.openai.com/v1/audio/transcriptions',
      key: openaiKey,
      model: 'whisper-1'
    };
  }
  // Fallback: prefer Groq (free) if available, else OpenAI.
  if (groqKey) {
    return {
      url: 'https://api.groq.com/openai/v1/audio/transcriptions',
      key: groqKey,
      model: 'whisper-large-v3'
    };
  }
  if (openaiKey) {
    return {
      url: 'https://api.openai.com/v1/audio/transcriptions',
      key: openaiKey,
      model: 'whisper-1'
    };
  }
  return null;
};

export const useAudioRecording = ({ onTranscriptionComplete, provider }: UseAudioRecordingProps) => {
  const [isRecordingSystem, setIsRecordingSystem] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const transcribeAudio = async (audioBlob: Blob) => {
    const endpoint = resolveWhisperEndpoint(provider);
    if (!endpoint) {
      console.error('No Whisper-capable provider key found (set VITE_GROQ_API_KEY or VITE_OPENAI_API_KEY)');
      onTranscriptionComplete('No transcription key configured. Add VITE_GROQ_API_KEY (free) or VITE_OPENAI_API_KEY to .env');
      return;
    }

    console.log(`Transcribing audio via ${endpoint.url}`);
    const file = new File([audioBlob], 'audio.ogg', { type: audioBlob.type });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', endpoint.model);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${endpoint.key}` },
        body: formData
      });

      const data = await response.json();
      console.log('Transcribed text:', data.text);

      if (data.text && data.text.trim()) {
        onTranscriptionComplete(data.text);
      }
    } catch (error) {
      console.error('Error in transcribing:', error);
      onTranscriptionComplete('Error transcribing audio.');
    }
  };

  const startRecording = useCallback(async () => {
    console.log('🎬 [useAudioRecording] startRecording called');

    if (isInitializing) return;
    setIsInitializing(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ [useAudioRecording] Microphone stream obtained');

      let mimeType = 'audio/ogg; codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm; codecs=opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn(`Mime type ${mimeType} not supported, falling back to audio/webm`);
        mimeType = 'audio/webm';
      }

      console.log(`Using MIME type: ${mimeType}`);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('🛑 [useAudioRecording] Recording stopped, processing...');
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });

        stream.getTracks().forEach(track => track.stop());

        if (audioBlob.size > 0) {
          transcribeAudio(audioBlob);
        }
        setIsInitializing(false);
      };

      mediaRecorder.start();
      setIsRecordingSystem(true);
      setIsInitializing(false);
    } catch (error) {
      console.error('❌ [useAudioRecording] Error starting recording:', error);
      setIsInitializing(false);
      setIsRecordingSystem(false);
      alert('Could not access microphone. Please check permissions.');
    }
  }, [isInitializing, onTranscriptionComplete, provider]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecordingSystem(false);
    }
  }, []);

  return {
    isRecording: isRecordingSystem,
    isInitializing,
    startRecording,
    stopRecording
  };
};
