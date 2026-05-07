import React from 'react';
import { Download, X } from 'lucide-react';

interface ScreenshotModalProps {
    screenshotDataUrl: string | null;
    onClose: () => void;
    onDownload: () => void;
}

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
    screenshotDataUrl,
    onClose,
    onDownload
}) => {
    if (!screenshotDataUrl) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/80 p-4 duration-200 fade-in"
            onClick={onClose}
        >
            <div
                className="custom-scrollbar max-h-[90vh] max-w-5xl overflow-auto rounded-lg border border-[var(--matte-border)] bg-[var(--matte-panel)] p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-[var(--matte-text)]">Screenshot Preview</h3>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-[var(--matte-text-soft)] transition-colors hover:bg-[rgba(232,226,214,0.08)] hover:text-[var(--matte-text)]"
                        title="Close"
                    >
                        <X size={19} />
                    </button>
                </div>
                <img
                    src={screenshotDataUrl}
                    alt="Screenshot"
                    className="h-auto max-w-full rounded-lg border border-[var(--matte-border)]"
                />
                <div className="flex gap-3 mt-4 justify-end">
                    <button
                        onClick={onDownload}
                        className="header-chip is-on"
                    >
                        <Download size={15} />
                        Download
                    </button>
                    <button
                        onClick={onClose}
                        className="header-chip"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
