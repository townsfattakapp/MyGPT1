import React from 'react';
import { Send, Square, Headphones, Crop, Mic } from 'lucide-react';

interface InputAreaProps {
  input: string;
  setInput: (value: string) => void;
  handleSend: () => void;
  loading: boolean;
  stopGeneration: () => void;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  isLive: boolean;
  startLive: () => void;
  stopLive: () => void;
  isProcessingScreenshot: boolean;
  isAreaCaptureMode: boolean;
  onEnterAreaCaptureMode: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
  input,
  setInput,
  handleSend,
  loading,
  stopGeneration,
  isRecording,
  startRecording,
  stopRecording,
  isLive,
  startLive,
  stopLive,
  isProcessingScreenshot,
  isAreaCaptureMode,
  onEnterAreaCaptureMode
}) => {
  const isRecordingButtonDisabled = !isRecording && (isLive || isProcessingScreenshot);
  const isLiveButtonDisabled = !isLive && isRecording;

  return (
    <div className="composer relative flex items-center gap-3 p-3">
      {isRecording && (
        <div className="absolute -top-11 left-0 right-0 flex justify-center">
          <div className="soft-status-banner danger">
            <span className="h-2 w-2 rounded-full bg-current opacity-80" />
            Recording with high accuracy...
          </div>
        </div>
      )}
      {isProcessingScreenshot && (
        <div className="absolute -top-11 left-0 right-0 flex justify-center">
          <div className="soft-status-banner warn">
            <span className="h-2 w-2 rounded-full bg-current opacity-80" />
            Processing Screenshot...
          </div>
        </div>
      )}

      <input
        type="text"
        className="composer-input min-w-0 flex-1 cursor-text"
        placeholder="Type a message..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
      />

      <div className="flex shrink-0 gap-2">
        <button
          onClick={loading ? stopGeneration : () => handleSend()}
          className={`tool-button ${loading ? 'danger' : input.trim() ? 'primary' : ''}`}
          title={loading ? 'Stop Generating' : 'Send Message'}
        >
          {loading ? <Square size={19} fill="currentColor" /> : <Send size={19} />}
        </button>

        {/* High accuracy recording button */}
        <button
          onClick={() => {
            if (isRecording) {
              stopRecording();
            } else if (!isRecordingButtonDisabled) {
              startRecording();
            }
          }}
          disabled={isRecordingButtonDisabled}
          className={`tool-button ${isRecording ? 'danger' : ''}`}
          title={isRecording ? 'Stop High Accuracy Recording (L)' : 'High Accuracy Recording (L)'}
        >
          <Headphones size={19} />
        </button>

        {/* New Live Transcription Button */}
        <button
          onClick={() => {
            if (isLive) {
              stopLive();
            } else if (!isLiveButtonDisabled) {
              startLive();
            }
          }}
          disabled={isLiveButtonDisabled}
          className={`tool-button ${isLive ? 'primary' : ''}`}
          title={isLive ? 'Stop Live Transcription' : 'Live Transcription'}
        >
          <Mic size={19} />
        </button>

        <button
          onClick={() => {
            if (!isAreaCaptureMode && !isProcessingScreenshot) {
              onEnterAreaCaptureMode();
            }
          }}
          disabled={isAreaCaptureMode || isProcessingScreenshot}
          className={`tool-button ${isAreaCaptureMode ? 'warn' : ''}`}
          title="Area Screenshot (S)"
        >
          <Crop size={19} />
        </button>
      </div>
    </div>
  );
};
