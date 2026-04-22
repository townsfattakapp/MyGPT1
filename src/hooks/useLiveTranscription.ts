import { useCallback, useRef, useState } from 'react';
import type { AIProvider } from '../services/aiProvider';

interface UseRealtimeTranscriptionProps {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  language?: string;
  provider?: AIProvider;
}

export const useRealtimeTranscription = ({
  onPartial,
  onFinal,
  language = 'en-US',
  provider
}: UseRealtimeTranscriptionProps) => {
  const [isRecording, setIsRecording] = useState(false);

  // OpenAI Realtime refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Browser SpeechRecognition ref (used for non-OpenAI providers)
  const recognitionRef = useRef<any>(null);

  const floatTo16BitPCM = (input: Float32Array) => {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < input.length; i++, offset += 2) {
      let sample = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return buffer;
  };

  /* ----------------------------------------
     BROWSER SPEECH RECOGNITION (free, unlimited)
     Used for Gemini / DeepSeek / Groq
  -----------------------------------------*/
  const startBrowserRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('❌ Browser SpeechRecognition not available. Use Chrome/Edge.');
      alert('Live transcription requires Chrome or Edge (uses Web Speech API).');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          console.log('✅ SpeechRecognition final:', transcript);
          onFinal(transcript);
        } else {
          console.log('🔤 SpeechRecognition partial:', transcript);
          onPartial(transcript);
        }
      }
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
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log('✅ Microphone accessed');
    } catch (err) {
      console.error('❌ Failed to access microphone:', err);
      return;
    }

    const ws = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
      ['realtime', 'openai-insecure-api-key.' + apiKey, 'openai-beta.realtime-v1']
    );

    wsRef.current = ws;

    ws.onopen = async () => {
      console.log('✅ Realtime WS connected');
      setIsRecording(true);

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(1024, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

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
          for (const chunk of audioBuffer) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }

          const uint8Array = new Uint8Array(combined.buffer);
          const base64Audio = btoa(String.fromCharCode(...uint8Array));

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
            threshold: 0.45,
            prefix_padding_ms: 0,
            silence_duration_ms: 0
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
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    processorRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    wsRef.current = null;

    setIsRecording(false);
  }, []);

  return {
    isRecording,
    start,
    stop
  };
};
