import React from 'react';
import { X } from 'lucide-react';

interface LiveTranscriptionModalProps {
    isVisible: boolean;
    transcript: string;
    onClose: () => void;
}

export const LiveTranscriptionModal: React.FC<LiveTranscriptionModalProps> = ({
    isVisible,
    transcript,
    onClose
}) => {
    if (!isVisible) return null;

    return (
        <div className="pointer-events-none absolute top-14 z-50 flex w-full items-center justify-center">
            <div className="relative w-full max-w-2xl mx-4 pointer-events-auto">
                {/* Modal Container */}
                <div className="overflow-hidden rounded-lg border border-[var(--matte-jade-border)] bg-[rgba(26,27,22,0.96)] shadow-2xl backdrop-blur-lg">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[var(--matte-border)] bg-[var(--matte-jade-soft)] px-4 py-3">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-3 w-3">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--matte-jade)] opacity-45"></span>
                                <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--matte-jade)]"></span>
                            </span>
                            <h3 className="text-sm font-semibold text-[#c9eadf]">Live Transcription</h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-lg p-1 text-[var(--matte-text-soft)] transition-colors hover:bg-[rgba(232,226,214,0.08)] hover:text-[var(--matte-text)]"
                            title="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Transcript Display - 2 lines with scroll */}
                    <div className="custom-scrollbar h-16 overflow-y-auto px-4 py-3">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--matte-text)]">
                            {transcript || 'Listening...'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
