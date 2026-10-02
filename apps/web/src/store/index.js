import { create } from 'zustand';

// Maps the store's camelCase fields onto the API/WS snake_case
// names. Used by setStreamStatus so a partial payload (a broadcast
// that carries only a few columns) updates just those fields
// instead of blanking everything it omits.
const STREAM_STATUS_FIELDS = [
  ['id', 'id'],
  ['isLive', 'is_live'],
  ['title', 'title'],
  ['description', 'description'],
  ['event_id', 'event_id'],
  ['activeCamera', 'active_camera'],
  ['viewerCount', 'viewer_count'],
  ['peakViewers', 'peak_viewers'],
  ['chatEnabled', 'chat_enabled'],
  ['startedAt', 'started_at'],
  ['endedAt', 'ended_at'],
];

export const useStreamStore = create((set) => ({
  id: null,
  isLive: false,
  title: null,
  description: null,
  event_id: null,
  activeCamera: 'cam1',
  viewerCount: 0,
  peakViewers: 0,
  chatEnabled: true,
  startedAt: null,
  endedAt: null,

  // Merges — undefined values in `status` are ignored. A WebSocket
  // event that omits a field must never erase it from the store.
  setStreamStatus: (status) =>
    set((state) => {
      const patch = {};
      for (const [storeKey, apiKey] of STREAM_STATUS_FIELDS) {
        if (status[apiKey] !== undefined) patch[storeKey] = status[apiKey];
      }
      return { ...state, ...patch };
    }),

  setIsLive: (isLive) => set({ isLive }),
  setTitle: (title) => set({ title }),
  setActiveCamera: (camera) => set({ activeCamera: camera }),
  setViewerCount: (count) =>
    set((state) => ({
      viewerCount: count,
      peakViewers: count > state.peakViewers ? count : state.peakViewers,
    })),
  setChatEnabled: (enabled) => set({ chatEnabled: enabled }),
}));

export const useChatStore = create((set) => ({
  messages: [],

  addMessage: (msg) =>
    set((state) => {
      if (state.messages.some((m) => m.id === msg.id)) return state;
      return { messages: [...state.messages, msg] };
    }),

  deleteMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    })),

  markDeleted: (messageId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, deleted: true } : m
      ),
    })),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [] }),
}));
