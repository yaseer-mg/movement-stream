import { useState } from 'react';
import AdminLayout from '../../components/ui/AdminLayout';
import useChatMod from '../../hooks/useChatMod';
import useStream from '../../hooks/useStream';
import { deleteMessage } from '../../services/chat.service';
import { toggleChat } from '../../services/stream.service';

function ChatModMessage({ message, onDelete }) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isDeleted = message.deleted;

  return (
    <div className={`flex items-start justify-between gap-3 px-3 py-2 rounded ${isDeleted ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isDeleted ? 'text-brand-light-muted line-through' : 'text-brand-light-dim'}`}>
            {message.display_name}
          </span>
          <span className="text-2xs text-brand-light-muted">{time}</span>
          {isDeleted && (
            <span className="text-2xs text-brand-red font-medium">DELETED</span>
          )}
        </div>
        <p className={`text-sm break-words mt-0.5 ${isDeleted ? 'text-brand-light-muted line-through' : 'text-white'}`}>
          {message.message}
        </p>
      </div>

      {!isDeleted && onDelete && (
        <button
          onClick={() => onDelete(message.id, message.message)}
          className="shrink-0 mt-1 text-2xs text-brand-light-muted hover:text-brand-red transition-colors"
          title="Delete message"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function ChatMod() {
  const { isLive, chatEnabled } = useStream();
  const { messages } = useChatMod(isLive ? 'live' : null);
  const [toggling, setToggling] = useState(false);

  const handleToggleChat = async () => {
    setToggling(true);
    try {
      await toggleChat(!chatEnabled);
    } catch {
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async (messageId) => {
    try {
      await deleteMessage(messageId);
    } catch {}
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Chat Moderation</h1>
          <p className="text-brand-light-muted text-sm mt-1">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Chat toggle */}
      <div className="rounded-lg border border-brand-dark-border bg-brand-dark-card p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-semibold">Live Chat</p>
            <p className="text-brand-light-muted text-xs mt-0.5">
              {chatEnabled ? 'Viewers can send messages' : 'Chat is currently disabled'}
            </p>
          </div>
          <button
            onClick={handleToggleChat}
            disabled={toggling || !isLive}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              chatEnabled ? 'bg-brand-green' : 'bg-brand-dark-border'
            } ${!isLive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                chatEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="rounded-lg border border-brand-dark-border bg-brand-dark-card overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-dark-border">
          <h2 className="text-white text-sm font-semibold">Messages</h2>
        </div>
        <div className="max-h-[600px] overflow-y-auto divide-y divide-brand-dark-border">
          {messages.length === 0 ? (
            <p className="text-brand-light-muted text-sm text-center py-12">No messages yet</p>
          ) : (
            messages.map((msg) => (
              <ChatModMessage
                key={msg.id}
                message={msg}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
