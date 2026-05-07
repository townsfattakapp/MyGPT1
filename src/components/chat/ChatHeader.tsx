import React from 'react';
import {
    AlertTriangle,
    Bot,
    ChevronDown,
    Circle,
    Eye,
    EyeOff,
    Lock,
    Search,
    Shield,
    Sparkles,
    Trash2,
    UserRound,
    Zap
} from 'lucide-react';
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
                return { name: 'OpenAI', className: 'provider-openai', Icon: Bot };
            case 'deepseek':
                return { name: 'DeepSeek', className: 'provider-deepseek', Icon: Search };
            case 'gemini':
                return { name: 'Gemini', className: 'provider-gemini', Icon: Sparkles };
            case 'groq':
                return { name: 'Groq', className: 'provider-groq', Icon: Zap };
            default:
                return { name: provider, className: 'provider-openai', Icon: Circle };
        }
    };

    const currentInfo = getProviderInfo(currentProvider);
    const CurrentProviderIcon = currentInfo.Icon;
    const {
        isStealth,
        protectedModeActive,
        concealMode,
        platform,
        toggle,
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
    const StealthIcon = !stealthKnown ? Circle : stealthEnabled ? EyeOff : Eye;
    const handleSecureRestore = async () => {
        const ok = window.confirm(
            'Are you sure you want to show the app? It may be visible on screen share.'
        );
        if (!ok) return;
        await requestSecureRestore(false, 'renderer-confirm');
    };

    return (
        <header className="chat-header sticky top-0 z-10 px-2 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <div className={`provider-select-shell ${currentInfo.className}`}>
                        <CurrentProviderIcon size={14} strokeWidth={2.3} />
                        <select
                            value={currentProvider}
                            onChange={(e) => switchProvider(e.target.value as AIProvider)}
                            className="provider-select-native"
                            title="AI provider"
                        >
                            {providers.map(provider => {
                                const info = getProviderInfo(provider);
                                return (
                                    <option key={provider} value={provider}>
                                        {info.name}
                                    </option>
                                );
                            })}
                        </select>
                        <ChevronDown size={14} />
                    </div>

                    <div className="header-chip" title="Provider is ready">
                        <span className="status-dot" />
                        <span>Ready</span>
                    </div>

                    <button
                        onClick={toggle}
                        disabled={!stealthKnown || restoreLockedByProtected}
                        title={
                            !stealthKnown
                                ? 'Stealth status syncing from main process...'
                                : restoreLockedByProtected
                                ? 'Protected Mode is ON. Use Secure Show to restore.'
                                : stealthEnabled
                                ? 'Stealth ON - window is hidden from screen share. Press Ctrl+Shift+S to show.'
                                : `Stealth OFF - press Ctrl+Shift+H to hide from screen share.${
                                      contentProtectionOff
                                          ? ' Warning: content protection is not supported on Linux, so enable stealth before screen sharing.'
                                          : ''
                                  }`
                        }
                        className={`header-chip ${
                            !stealthKnown
                                ? 'is-disabled'
                                : restoreLockedByProtected
                                ? 'is-danger'
                                : stealthEnabled
                                ? 'is-on'
                                : ''
                        }`}
                    >
                        <StealthIcon size={14} />
                        <span>{stealthKnown ? `Stealth${stealthEnabled ? ' ON' : ''}` : 'Loading'}</span>
                    </button>

                    <button
                        onClick={toggleProtectedMode}
                        disabled={!protectedKnown}
                        title={protectedEnabled ? 'Protected Mode ON - normal restore clicks are blocked.' : 'Protected Mode OFF'}
                        className={`header-chip ${!protectedKnown ? 'is-disabled' : protectedEnabled ? 'is-warn' : ''}`}
                    >
                        <Shield size={14} />
                        <span>Protected{protectedEnabled ? ' ON' : ''}</span>
                    </button>

                    <label
                        className={`header-chip ${concealKnown ? '' : 'is-disabled'}`}
                        title="Choose how Stealth conceals content"
                    >
                        <select
                            value={concealValue}
                            onChange={(e) => setConcealMode(e.target.value as StealthConcealMode)}
                            disabled={!concealKnown}
                        >
                            <option value="hide">Full Hide</option>
                            <option value="overlay">Overlay</option>
                        </select>
                    </label>

                    {stealthEnabled && (
                        <button
                            onClick={handleSecureRestore}
                            title="Secure restore with confirmation"
                            className="header-chip is-on"
                        >
                            <Lock size={14} />
                            <span>Show</span>
                        </button>
                    )}

                    {contentProtectionOff && stealthEnabled === false && (
                        <div
                            title="On Linux, setContentProtection is a no-op. The window will appear in screen shares unless you enable Stealth."
                            className="header-chip is-warn"
                        >
                            <AlertTriangle size={14} />
                            <span>{isLinux ? 'Linux' : platform?.platform} capture</span>
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    <button
                        onClick={onEditProfile}
                        title="Edit the user profile injected into the system prompt"
                        className="header-chip"
                    >
                        <UserRound size={14} />
                        <span>Profile</span>
                    </button>
                    {messageCount > 0 && (
                        <button
                            onClick={clearChat}
                            className="header-chip is-danger"
                            title="Clear chat"
                        >
                            <Trash2 size={14} />
                            <span>Clear</span>
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
};
