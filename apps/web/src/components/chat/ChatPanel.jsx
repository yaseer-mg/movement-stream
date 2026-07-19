import { useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

export default function ChatPanel({
  messages,
  onSend,
  onDelete,
  isAuthenticated,
  isAdmin,
  chatEnabled,
  streamId,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-brand-dark-card border border-brand-dark-border rounded-lg overflow-hidden">
      <div className="p-3 border-b border-brand-dark-border">
        <h3 className="text-white text-sm font-semibold">Live Chat</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {streamId && !(messages && messages.length > 0) && (
          <p className="text-brand-light-muted text-xs text-center">No messages yet</p>
        )}
        {messages && messages.length > 0 && messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onDelete={onDelete} isAdmin={isAdmin} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-brand-dark-border">
        {chatEnabled ? (
          isAuthenticated ? (
            <ChatInput onSend={onSend} />
          ) : (
            <p className="text-brand-light-muted text-xs text-center">Sign in to send messages</p>
          )
        ) : (
          <p className="text-brand-light-muted text-xs text-center">Chat is disabled</p>
        )}
      </div>
    </div>
  );
}
