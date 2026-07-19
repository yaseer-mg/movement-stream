import { create } from 'zustand';

export const useStreamStore = create((set) => ({
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

  setStreamStatus: (status) =>
    set({
      isLive: status.is_live,
      title: status.title,
      description: status.description,
      event_id: status.event_id,
      activeCamera: status.active_camera,
      viewerCount: status.viewer_count,
      peakViewers: status.peak_viewers,
      chatEnabled: status.chat_enabled,
      startedAt: status.started_at,
      endedAt: status.ended_at,
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

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [] }),
}));
