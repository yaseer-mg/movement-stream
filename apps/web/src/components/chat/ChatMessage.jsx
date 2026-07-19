export default function ChatMessage({ message, isOwn, onDelete, isAdmin }) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-brand-light-muted font-medium">{message.display_name}</span>
        <span className="text-2xs text-brand-light-muted">{time}</span>
      </div>
      <p className="text-sm text-white break-words">{message.message}</p>
      {isAdmin && onDelete && (
        <button onClick={() => onDelete(message.id)} className="text-2xs text-brand-light-muted hover:text-brand-red mt-0.5">
          Delete
        </button>
      )}
    </div>
  );
}
