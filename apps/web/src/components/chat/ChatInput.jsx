import { useState } from "react";

export default function ChatInput({ onSend, disabled, placeholder }) {
  const [text, setText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed) {
      onSend(trimmed);
      setText("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={disabled ? "Chat is disabled" : (placeholder || "Type a message...")}
        disabled={disabled}
        className="flex-1 bg-brand-dark border border-brand-dark-border rounded-md px-3 py-2 text-sm text-white placeholder:text-brand-light-muted focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green/30 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="px-4 py-2 bg-brand-green text-white text-sm font-medium rounded-md hover:bg-brand-green-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </form>
  );
}
