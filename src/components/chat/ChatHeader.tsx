import React from 'react';
import {
    AlertTriangle,
    Bot,
    Circle,
    Eye,
    EyeOff,
    Lock,
    RefreshCw,
    Shield,
    Trash2,
    UserRound,
} from 'lucide-react';
import { AIProvider } from '../../services/aiProvider';
import { useStealthMode } from '../../hooks/useStealthMode';
import type { StealthConcealMode } from '../../types/electron';

interface ChatHeaderProps {
    messageCount: number;
    currentProvider: AIProvider;
    cycleProvider: () => void;
    revealProviderName: boolean;
    getAvailableProviders: () => AIProvider[];
    clearChat: () => void;
    onEditProfile: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    messageCount,
    currentProvider,
    cycleProvider,
    revealProviderName,
    getAvailableProviders,
    clearChat,
    onEditProfile
}) => {
    const providers = getAvailableProviders();

    const getProviderName = (provider: AIProvider) => {
        switch (provider) {
            case 'openai':
                return 'OpenAI';
            case 'deepseek':
                return 'DeepSeek';
            case 'gemini':
                return 'Gemini';
            case 'groq':
                return 'Groq';
            default:
                return provider;
        }
    };

    const currentProviderName = getProviderName(currentProvider);
    const providerIndex = providers.indexOf(currentProvider);
    const providerPosition = providerIndex >= 0 ? providerIndex + 1 : 1;
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
                    <button
                        type="button"
                        onClick={cycleProvider}
                        className="provider-select-shell provider-cycle-button provider-private"
                        title="Switch AI provider (Ctrl+Shift+A)"
                        aria-label={`Switch AI provider. Current provider: ${currentProviderName}`}
                    >
                        <Bot size={14} strokeWidth={2.3} />
                        <span className={`provider-cycle-label ${revealProviderName ? 'is-revealed' : ''}`}>
                            {revealProviderName ? `AI: ${currentProviderName}` : 'AI'}
                        </span>
                        {providers.length > 1 && !revealProviderName && (
                            <span className="provider-cycle-count">
                                {providerPosition}/{providers.length}
                            </span>
                        )}
                        <RefreshCw size={13} />
                    </button>

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
