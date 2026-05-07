import React, { useEffect, useState } from 'react';
import { X, RotateCcw, Save } from 'lucide-react';

interface ProfileEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    userProfile: string;
    onSave: (profile: string) => void;
    onReset: () => void;
}

export const ProfileEditorModal: React.FC<ProfileEditorModalProps> = ({
    isOpen,
    onClose,
    userProfile,
    onSave,
    onReset
}) => {
    const [draft, setDraft] = useState(userProfile);

    useEffect(() => {
        if (isOpen) setDraft(userProfile);
    }, [isOpen, userProfile]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(draft);
        onClose();
    };

    const handleReset = () => {
        if (!window.confirm('Reset profile to the built-in default?')) return;
        onReset();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-[var(--matte-border)] bg-[var(--matte-panel)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--matte-border)] px-5 py-3">
                    <div>
                        <h2 className="font-semibold text-[var(--matte-text)]">Edit User Profile</h2>
                        <p className="mt-0.5 text-xs text-[var(--matte-muted)]">
                            This text is injected into the system prompt so the AI tailors answers to your background.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-[var(--matte-text-soft)] transition-colors hover:bg-[rgba(232,226,214,0.08)] hover:text-[var(--matte-text)]"
                        title="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-5">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        spellCheck={false}
                        className="h-[55vh] w-full resize-none rounded-lg border border-[var(--matte-border-soft)] bg-[var(--matte-input)] p-3 font-mono text-sm text-[var(--matte-text)] outline-none transition-colors focus:border-[var(--matte-jade-border)]"
                        placeholder="Describe your background: role, experience, projects, core skills..."
                    />
                    <div className="mt-2 text-xs text-[var(--matte-muted)]">
                        {draft.length.toLocaleString()} characters
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--matte-border)] bg-[rgba(16,17,14,0.36)] px-5 py-3">
                    <button
                        onClick={handleReset}
                        className="header-chip"
                    >
                        <RotateCcw size={14} />
                        Reset to default
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="header-chip"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="header-chip is-on"
                        >
                            <Save size={14} />
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
