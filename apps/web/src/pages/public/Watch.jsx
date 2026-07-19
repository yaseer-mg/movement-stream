import { useState, useCallback } from 'react';
import Navbar from '../../components/ui/Navbar';
import Footer from '../../components/ui/Footer';
import VideoPlayer from '../../components/player/VideoPlayer';
import QualitySelector from '../../components/player/QualitySelector';
import ViewerCount from '../../components/player/ViewerCount';
import ChatPanel from '../../components/chat/ChatPanel';
import useStream from '../../hooks/useStream';
import useChat from '../../hooks/useChat';
import useAuth from '../../hooks/useAuth';
import { sendMessage as sendChatMessage, deleteMessage as deleteChatMessage } from '../../services/chat.service';

export default function Watch() {
  const stream = useStream();
  const chat = useChat(stream.event_id);
  const { isAuthenticated, isAdmin } = useAuth();
  const [quality, setQuality] = useState('auto');

  const hlsBaseUrl = import.meta.env.VITE_HLS_URL || 'http://localhost/hls';
  const hlsSrc = stream.isLive
    ? `${hlsBaseUrl}/master.m3u8`
    : null;

  const handleSend = useCallback(async (text) => {
    try {
      await sendChatMessage({ message: text, stream_id: stream.event_id });
    } catch {}
  }, [stream.event_id]);

  const handleDelete = useCallback(async (messageId) => {
    try {
      await deleteChatMessage(messageId);
    } catch {}
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Main video area */}
            <div className="flex-1 min-w-0">
              {stream.isLive ? (
                <VideoPlayer src={hlsSrc} />
              ) : stream.startedAt ? (
                <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-white text-lg font-medium">Stream has ended</p>
                    <a href="/recordings" className="text-brand-green-400 text-sm hover:text-brand-green-300">Watch recording</a>
                  </div>
                </div>
              ) : (
                <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-white text-lg font-medium">Stream is not live</p>
                    <p className="text-brand-light-muted text-sm mt-1">Check the events page for upcoming streams</p>
                  </div>
                </div>
              )}

              {/* Stream info bar */}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <QualitySelector currentQuality={quality} onQualityChange={setQuality} />
                <ViewerCount count={stream.viewerCount} />
                {stream.title && (
                  <h1 className="text-white text-lg font-semibold">{stream.title}</h1>
                )}
              </div>
            </div>

            {/* Chat sidebar */}
            <div className="w-full lg:w-80 xl:w-96 h-[500px] lg:h-[600px]">
              <ChatPanel
                messages={chat.messages}
                onSend={handleSend}
                onDelete={isAdmin ? handleDelete : undefined}
                isAuthenticated={isAuthenticated}
                isAdmin={isAdmin}
                chatEnabled={stream.chatEnabled}
                streamId={stream.event_id}
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
