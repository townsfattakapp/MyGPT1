import React, { memo } from 'react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import TypeLoading from '../TypeLoading';

interface Message {
    role: string;
    content: string;
    image?: string;
}

interface MessageListProps {
    messages: Message[];
    loading: boolean;
    messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const MessageList: React.FC<MessageListProps> = memo(({ messages, loading, messagesEndRef }) => {
    return (
        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-4 scroll-smooth sm:px-4">
            {messages.map((msg, idx) => (
                <div
                    key={idx}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                    {msg.image && (
                        <div className="mb-2 max-w-[85%]">
                            <img
                                src={msg.image}
                                alt="User upload"
                                className="max-h-60 rounded-lg border border-[var(--matte-border)] shadow-lg"
                            />
                        </div>
                    )}
                    <div
                        className={`message-bubble cursor-default px-4 py-3 ${msg.role === 'user'
                            ? 'message-bubble-user max-w-[78%] md:max-w-[640px]'
                            : 'message-bubble-assistant max-w-[86%] md:max-w-[760px]'
                            }`}
                    >
                        {msg.role === 'user' ? (
                            <div className="cursor-default whitespace-pre-wrap text-[15px] font-medium leading-relaxed">
                                {msg.content}
                            </div>
                        ) : (
                            <div className="markdown-container cursor-default">
                                <MarkdownPreview
                                    source={msg.content}
                                    style={{
                                        backgroundColor: 'transparent',
                                        color: 'inherit',
                                        fontSize: '15px',
                                        lineHeight: '1.6'
                                    }}
                                    wrapperElement={{
                                        "data-color-mode": "dark"
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {loading && (
                <div className="flex justify-start animate-fade-in">
                    <div className="message-bubble message-bubble-assistant px-4 py-3">
                        <TypeLoading />
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
        </div>
    );
});
