import { useState, useRef, useCallback } from 'react';
import type { AIProvider } from '../services/aiProvider';
import { getSelectedGroqApiKey, withGroqFallback } from '../utils/groqKeys';

interface UseAudioRecordingProps {
  onTranscriptionComplete: (text: string) => void;
  provider?: AIProvider;
}

interface WhisperEndpoint {
  provider: 'groq' | 'openai';
  url: string;
  key: string;
  model: string;
}

interface TranscriptionError extends Error {
  status?: number;
  headers?: Headers;
  response?: {
    status: number;
    headers: Headers;
  };
}

const HIGH_ACCURACY_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16
  }
};

const TRANSCRIPTION_LANGUAGE = 'en';

const TRANSCRIPTION_PROMPT = [
  'The speaker is a software engineer answering technical interview questions.',
  'Preserve programming and interview terms accurately, such as React, Next.js, TypeScript, JavaScript, Node.js, API, REST, SQL, JWT, Docker, AWS, DSA, arrays, hash map, stack, queue, binary search, dynamic programming, time complexity, and space complexity.',
  'Do not rewrite the meaning. Transcribe exactly what was spoken as clearly as possible.'
].join(' ');

const getPreferredMimeType = () => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
};

const getAudioFileName = (mimeType: string) => {
  if (mimeType.includes('ogg')) return 'recording.ogg';
  if (mimeType.includes('webm')) return 'recording.webm';
  if (mimeType.includes('wav')) return 'recording.wav';
  return 'recording.webm';
};

// Provider → Whisper endpoint. Groq hosts whisper-large-v3 for free; OpenAI-compatible payload.
// Providers without audio (gemini, deepseek) fall back to OpenAI Whisper if a key is set,
// else Groq Whisper if a Groq key is set.
const resolveWhisperEndpoint = (provider: AIProvider | undefined) => {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const groqKey = getSelectedGroqApiKey();

  if (provider === 'groq' && groqKey) {
    return {
      url: 'https://api.groq.com/openai/v1/audio/transcriptions',
      key: groqKey,
      model: 'whisper-large-v3',
      provider: 'groq' as const
    };
  }
  if (provider === 'openai' && openaiKey) {
    return {
      url: 'https://api.openai.com/v1/audio/transcriptions',
      key: openaiKey,
      model: 'whisper-1',
      provider: 'openai' as const
    };
  }
  // Fallback: prefer Groq (free) if available, else OpenAI.
  if (groqKey) {
    return {
      url: 'https://api.groq.com/openai/v1/audio/transcriptions',
      key: groqKey,
      model: 'whisper-large-v3',
      provider: 'groq' as const
    };
  }
  if (openaiKey) {
    return {
      url: 'https://api.openai.com/v1/audio/transcriptions',
      key: openaiKey,
      model: 'whisper-1',
      provider: 'openai' as const
    };
  }
  return null;
};

const createTranscriptionError = (response: Response, data: { error?: { message?: string } }) => {
  const message = data?.error?.message || `Transcription failed with status ${response.status}`;
  const error = new Error(message) as TranscriptionError;

  error.status = response.status;
  error.headers = response.headers;
  error.response = {
    status: response.status,
    headers: response.headers
  };

  return error;
};

const requestTranscription = async (endpoint: WhisperEndpoint, audioBlob: Blob, apiKey = endpoint.key) => {
  const audioType = audioBlob.type || 'audio/webm';
  const file = new File([audioBlob], getAudioFileName(audioType), { type: audioType });
  const formData = new FormData();

  formData.append('file', file);
  formData.append('model', endpoint.model);
  formData.append('language', TRANSCRIPTION_LANGUAGE);
  formData.append('response_format', 'json');
  formData.append('temperature', '0');
  formData.append('prompt', TRANSCRIPTION_PROMPT);

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });

  const rawResponse = await response.text();
  const data = rawResponse ? JSON.parse(rawResponse) : {};

  if (!response.ok) {
    throw createTranscriptionError(response, data);
  }

  return data;
};

export const useAudioRecording = ({ onTranscriptionComplete, provider }: UseAudioRecordingProps) => {
  const [isRecordingSystem, setIsRecordingSystem] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      const endpoint = resolveWhisperEndpoint(provider);
      if (!endpoint) {
        console.error('No Whisper-capable provider key found (set VITE_GROQ_API_KEY or VITE_OPENAI_API_KEY)');
        onTranscriptionComplete(
          'No transcription key configured. Add VITE_GROQ_API_KEY (free) or VITE_OPENAI_API_KEY to .env'
        );
        return;
      }

      try {
        console.log(`Transcribing audio via ${endpoint.url}`);
        const data =
          endpoint.provider === 'groq'
            ? await withGroqFallback((apiKey) => requestTranscription(endpoint, audioBlob, apiKey))
            : await requestTranscription(endpoint, audioBlob);

        console.log('Transcribed text:', data.text);

        if (data.text && data.text.trim()) {
          onTranscriptionComplete(data.text.trim());
        } else {
          console.warn('No clear speech detected in the recording.');
        }
      } catch (error) {
        console.error('Error in transcribing:', error);
        onTranscriptionComplete('Error transcribing audio.');
      }
    },
    [onTranscriptionComplete, provider]
  );

  const startRecording = useCallback(async () => {
    console.log('🎬 [useAudioRecording] startRecording called');

    if (isInitializing) return;
    setIsInitializing(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(HIGH_ACCURACY_AUDIO_CONSTRAINTS);
      console.log('✅ [useAudioRecording] Microphone stream obtained');

      const mimeType = getPreferredMimeType();
      const recorderOptions = {
        audioBitsPerSecond: 128000,
        ...(mimeType ? { mimeType } : {})
      };

      console.log(`Using MIME type: ${mimeType || 'browser default'}`);

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
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

        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size > 0) {
          transcribeAudio(audioBlob);
        }
        setIsInitializing(false);
      };

      mediaRecorder.start(1000);
      setIsRecordingSystem(true);
      setIsInitializing(false);
    } catch (error) {
      console.error('❌ [useAudioRecording] Error starting recording:', error);
      setIsInitializing(false);
      setIsRecordingSystem(false);
      alert('Could not access microphone. Please check permissions.');
    }
  }, [isInitializing, transcribeAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.requestData();
      } catch {
        // Some browsers do not allow requestData during this exact state transition.
      }
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
