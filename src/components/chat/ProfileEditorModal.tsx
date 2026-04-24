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
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
                    <div>
                        <h2 className="text-white font-semibold">Edit User Profile</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            This text is injected into the system prompt so the AI tailors answers to your background.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
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
                        className="w-full h-[55vh] bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm text-gray-100 font-mono outline-none focus:border-blue-500 resize-none"
                        placeholder="Describe your background: role, experience, projects, core skills..."
                    />
                    <div className="text-xs text-gray-500 mt-2">
                        {draft.length.toLocaleString()} characters
                    </div>
                </div>

                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700 bg-gray-900/60">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
                    >
                        <RotateCcw size={14} />
                        Reset to default
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
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
