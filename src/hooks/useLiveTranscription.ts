import { useCallback, useRef, useState } from 'react';
import type { AIProvider } from '../services/aiProvider';

interface UseRealtimeTranscriptionProps {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  language?: string;
  provider?: AIProvider;
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

const uint8ArrayToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export const useRealtimeTranscription = ({
  onPartial,
  onFinal,
  language = 'en-IN',
  provider
}: UseRealtimeTranscriptionProps) => {
  const [isRecording, setIsRecording] = useState(false);

  // OpenAI Realtime refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Browser SpeechRecognition ref (used for non-OpenAI providers)
  const recognitionRef = useRef<any>(null);
  const lastBrowserPartialRef = useRef('');

  const floatTo16BitPCM = (input: Float32Array) => {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    input.forEach((value, index) => {
      const sample = Math.max(-1, Math.min(1, value));
      view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    });
    return buffer;
  };

  /* ----------------------------------------
     BROWSER SPEECH RECOGNITION (free, unlimited)
     Used for Gemini / DeepSeek / Groq
  -----------------------------------------*/
  const startBrowserRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('❌ Browser SpeechRecognition not available. Use Chrome/Edge.');
      alert('Live transcription requires Chrome or Edge (uses Web Speech API).');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const results = Array.from(
        { length: event.results.length - event.resultIndex },
        (_unused, index) => event.results[event.resultIndex + index]
      );

      results.forEach((result: any) => {
        const { transcript } = result[0];
        if (result.isFinal) {
          const finalTranscript = transcript.trim();
          const currentPartial = lastBrowserPartialRef.current;
          const finalDelta = transcript.startsWith(currentPartial)
            ? transcript.slice(currentPartial.length)
            : transcript;

          if (finalDelta.trim()) {
            onPartial(finalDelta);
          }

          lastBrowserPartialRef.current = '';
          console.log('✅ SpeechRecognition final:', finalTranscript);
          if (finalTranscript) onFinal(finalTranscript);
        } else {
          const currentPartial = lastBrowserPartialRef.current;
          const delta = transcript.startsWith(currentPartial) ? transcript.slice(currentPartial.length) : transcript;

          lastBrowserPartialRef.current = transcript;

          if (delta.trim()) {
            console.log('🔤 SpeechRecognition partial:', delta);
            onPartial(delta);
          }
        }
      });
    };

    recognition.onerror = (event: any) => {
      console.error('❌ SpeechRecognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsRecording(false);
      }
    };

    recognition.onend = () => {
      console.log('🛑 SpeechRecognition ended');
      // Auto-restart if user hasn't stopped
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          setIsRecording(false);
        }
      }
    };

    recognitionRef.current = recognition;
    lastBrowserPartialRef.current = '';
    recognition.start();
    setIsRecording(true);
    console.log('✅ Browser SpeechRecognition started');
  }, [language, onPartial, onFinal]);

  /* ----------------------------------------
     OPENAI REALTIME (WebSocket + PCM streaming)
  -----------------------------------------*/
  const startOpenAIRealtime = useCallback(async () => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      console.error('❌ VITE_OPENAI_API_KEY not set. Falling back to browser SpeechRecognition.');
      startBrowserRecognition();
      return;
    }

    let stream: MediaStream;
    try {
      console.log('🎤 Requesting microphone access...');
      stream = await navigator.mediaDevices.getUserMedia(HIGH_ACCURACY_AUDIO_CONSTRAINTS);
      streamRef.current = stream;
      console.log('✅ Microphone accessed');
    } catch (err) {
      console.error('❌ Failed to access microphone:', err);
      return;
    }

    const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', [
      'realtime',
      `openai-insecure-api-key.${apiKey}`,
      'openai-beta.realtime-v1'
    ]);

    wsRef.current = ws;

    ws.onopen = async () => {
      console.log('✅ Realtime WS connected');
      setIsRecording(true);

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(1024, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      processorRef.current = processor;
      silentGainRef.current = silentGain;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      let audioBuffer: Int16Array[] = [];
      let lastSendTime = Date.now();
      const SEND_INTERVAL_MS = 1000;

      processor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const float32 = event.inputBuffer.getChannelData(0);
        const pcm16Buffer = floatTo16BitPCM(float32);
        const int16Array = new Int16Array(pcm16Buffer);

        audioBuffer.push(int16Array);

        const now = Date.now();
        const elapsed = now - lastSendTime;

        if (elapsed >= SEND_INTERVAL_MS && audioBuffer.length > 0) {
          const totalLength = audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
          const combined = new Int16Array(totalLength);
          let offset = 0;
          audioBuffer.forEach((chunk) => {
            combined.set(chunk, offset);
            offset += chunk.length;
          });

          const uint8Array = new Uint8Array(combined.buffer);
          const base64Audio = uint8ArrayToBase64(uint8Array);

          ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64Audio }));

          audioBuffer = [];
          lastSendTime = now;
        }
      };

      const configMessage = {
        type: 'session.update',
        session: {
          modalities: ['text'],
          instructions: 'You are a helpful assistant that transcribes audio.',
          input_audio_format: 'pcm16',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 700
          }
        }
      };

      try {
        ws.send(JSON.stringify(configMessage));
      } catch (e) {
        console.error('Error sending config:', e);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'conversation.item.input_audio_transcription.completed':
            if (msg.transcript) onFinal(msg.transcript);
            break;
          case 'conversation.item.input_audio_transcription.delta':
            if (msg.delta) onPartial(msg.delta);
            break;
          case 'error':
            console.error('❌ Server Error:', msg.error);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    ws.onerror = (e) => {
      console.error('❌ Realtime WS error', e);
      setIsRecording(false);
    };

    ws.onclose = () => {
      console.log('🛑 Realtime WS closed');
      setIsRecording(false);
    };
  }, [onPartial, onFinal, startBrowserRecognition]);

  const start = useCallback(async () => {
    if (isRecording) return;
    // OpenAI gets the high-fidelity Whisper realtime path; everyone else gets
    // the free browser SpeechRecognition API.
    if (provider === 'openai') {
      await startOpenAIRealtime();
    } else {
      startBrowserRecognition();
    }
  }, [isRecording, provider, startOpenAIRealtime, startBrowserRecognition]);

  const stop = useCallback(() => {
    // Stop browser SpeechRecognition
    if (recognitionRef.current) {
      const r = recognitionRef.current;
      recognitionRef.current = null; // prevents auto-restart in onend
      try {
        r.stop();
      } catch {
        // ignore
      }
    }

    // Stop OpenAI Realtime path
    processorRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    processorRef.current = null;
    silentGainRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    wsRef.current = null;
    lastBrowserPartialRef.current = '';

    setIsRecording(false);
  }, []);

  return {
    isRecording,
    start,
    stop
  };
};
