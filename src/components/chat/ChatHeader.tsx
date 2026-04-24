import React from 'react';
import { AIProvider } from '../../services/aiProvider';
import { useStealthMode } from '../../hooks/useStealthMode';
import type { StealthConcealMode } from '../../types/electron';

interface ChatHeaderProps {
    messageCount: number;
    currentProvider: AIProvider;
    switchProvider: (provider: AIProvider) => void;
    getAvailableProviders: () => AIProvider[];
    clearChat: () => void;
    onEditProfile: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    messageCount,
    currentProvider,
    switchProvider,
    getAvailableProviders,
    clearChat,
    onEditProfile
}) => {
    const providers = getAvailableProviders();

    const getProviderInfo = (provider: AIProvider) => {
        switch (provider) {
            case 'openai':
                return { name: 'OpenAI', color: 'bg-blue-600', icon: '🤖' };
            case 'deepseek':
                return { name: 'DeepSeek', color: 'bg-orange-600', icon: '🔍' };
            case 'gemini':
                return { name: 'Gemini', color: 'bg-green-600', icon: '💎' };
            case 'groq':
                return { name: 'Groq (Llama 3.3)', color: 'bg-purple-600', icon: '⚡' };
            default:
                return { name: provider, color: 'bg-gray-600', icon: '❓' };
        }
    };

    const currentInfo = getProviderInfo(currentProvider);
    const {
        isStealth,
        protectedModeActive,
        concealMode,
        platform,
        toggleProtectedMode,
        setConcealMode,
        requestSecureRestore
    } = useStealthMode();
    const stealthKnown = isStealth !== null;
    const stealthEnabled = isStealth === true;
    const protectedKnown = protectedModeActive !== null;
    const protectedEnabled = protectedModeActive === true;
    const restoreLockedByProtected = stealthEnabled && protectedEnabled;
    const concealKnown = concealMode !== null;
    const concealValue: StealthConcealMode = concealMode ?? 'hide';

    const isLinux = platform?.platform === 'linux';
    const contentProtectionOff = platform && !platform.contentProtectionSupported;
    const handleSecureRestore = async () => {
        const ok = window.confirm(
            'Are you sure you want to show the app? It may be visible on screen share.'
        );
        if (!ok) return;
        await requestSecureRestore(false, 'renderer-confirm');
    };

    return (
        <div className="p-3 border-b border-gray-700/50 bg-gray-800/50 flex justify-between items-center backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-3">
                {/* Provider Selector */}
                <div className="relative">
                    <select
                        value={currentProvider}
                        onChange={(e) => switchProvider(e.target.value as AIProvider)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 shadow-sm appearance-none cursor-pointer ${currentInfo.color} hover:opacity-90 text-white pr-8`}
                    >
                        {providers.map(provider => {
                            const info = getProviderInfo(provider);
                            return (
                                <option key={provider} value={provider}>
                                    {info.icon} {info.name}
                                </option>
                            );
                        })}
                    </select>
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-2 px-2 py-1 bg-gray-700/50 rounded-lg">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    <span className="text-xs text-gray-300 font-medium">Ready</span>
                </div>

                {/* Stealth Mode Toggle - Enhanced */}
                <div className="relative">
                    {stealthEnabled && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Stealth Mode Active"></div>
                    )}
                    <button
                        onClick={() => window.Main?.ToggleStealth()}
                        disabled={!stealthKnown || restoreLockedByProtected}
                        title={
                            !stealthKnown
                                ? 'Stealth status syncing from main process...'
                                : restoreLockedByProtected
                                ? 'Protected Mode is ON. Use Secure Show (or Ctrl+Shift+S) to restore.'
                                : stealthEnabled
                                ? 'Stealth ON — window is hidden from screen share. Press Ctrl+Shift+S to show.'
                                : `Stealth OFF — press Ctrl+Shift+H to hide from screen share.${
                                      contentProtectionOff
                                          ? ' Warning: content protection is not supported on Linux, so you MUST enable stealth before screen sharing.'
                                          : ''
                                  }`
                        }
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border shadow-sm ${
                            !stealthKnown
                                ? 'bg-gray-700/30 border-gray-700 text-gray-500 cursor-not-allowed'
                                : restoreLockedByProtected
                                ? 'bg-red-900/20 border-red-500/50 text-red-300'
                                : stealthEnabled
                                ? 'bg-green-600/20 border-green-500/50 text-green-300 shadow-green-900/20'
                                : 'bg-gray-700/50 border-gray-600/50 text-gray-300 hover:bg-gray-700'
                        }`}
                    >
                        <span className="text-sm">
                            {stealthKnown ? (stealthEnabled ? '🕶️' : '👁️') : '⏳'}
                        </span>
                        <span>{stealthKnown ? `Stealth ${stealthEnabled ? 'ON' : 'OFF'}` : 'Loading...'}</span>
                        {stealthEnabled && (
                            <span className="text-xs opacity-75">(Ctrl+Shift+S to show)</span>
                        )}
                    </button>
                </div>

                <button
                    onClick={toggleProtectedMode}
                    disabled={!protectedKnown}
                    title={protectedEnabled ? 'Protected Mode ON — normal restore clicks are blocked.' : 'Protected Mode OFF'}
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-medium transition-all border ${
                        !protectedKnown
                            ? 'bg-gray-700/30 border-gray-700 text-gray-500 cursor-not-allowed'
                            : protectedEnabled
                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 hover:bg-amber-500/30'
                            : 'bg-gray-700/50 border-gray-600/50 text-gray-300 hover:bg-gray-700'
                    }`}
                >
                    <span>🛡️</span>
                    <span>Protected {protectedEnabled ? 'ON' : 'OFF'}</span>
                </button>

                <label
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-medium border ${
                        concealKnown ? 'bg-gray-700/50 border-gray-600/50 text-gray-200' : 'bg-gray-700/30 border-gray-700 text-gray-500'
                    }`}
                    title="Choose how Stealth conceals content"
                >
                    <span>Mode</span>
                    <select
                        value={concealValue}
                        onChange={(e) => setConcealMode(e.target.value as StealthConcealMode)}
                        disabled={!concealKnown}
                        className="bg-transparent text-xs outline-none cursor-pointer"
                    >
                        <option value="hide" className="text-black">Full Hide</option>
                        <option value="overlay" className="text-black">Overlay</option>
                    </select>
                </label>

                {stealthEnabled && (
                    <button
                        onClick={handleSecureRestore}
                        title="Secure restore with confirmation"
                        className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-medium transition-all border bg-blue-600/20 border-blue-400/50 text-blue-200 hover:bg-blue-600/30"
                    >
                        <span>🔐</span>
                        <span>Secure Show</span>
                    </button>
                )}

                {/* Linux content-protection warning */}
                {contentProtectionOff && stealthEnabled === false && (
                    <div
                        title="On Linux, setContentProtection is a no-op. The window will appear in screen shares unless you enable Stealth (Ctrl+Shift+H)."
                        className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/40 rounded-lg text-xs text-amber-300 font-medium"
                    >
                        <span>⚠️</span>
                        <span>
                            {isLinux ? 'Linux' : platform?.platform}: capture-visible
                        </span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                <div className="text-xs text-gray-400 hidden sm:block">
                    Ctrl+Shift+H: Stealth • Ctrl+Shift+S / Ctrl+Alt+S: Show
                </div>
                <button
                    onClick={onEditProfile}
                    title="Edit the user profile injected into the system prompt"
                    className="px-3 py-1 text-sm bg-blue-600/10 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/50 rounded-lg transition-all duration-200 font-medium"
                >
                    Profile
                </button>
                {messageCount > 0 && (
                    <button
                        onClick={clearChat}
                        className="px-3 py-1 text-sm bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/50 rounded-lg transition-all duration-200 font-medium"
                    >
                        Clear Chat
                    </button>
                )}
            </div>
        </div>
    );
};
