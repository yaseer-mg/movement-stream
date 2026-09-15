import { useRef, useEffect, useState } from "react";
import Hls from "hls.js";

export default function VideoPlayer({ src, poster, onError, autoPlay = true, quality = 'auto' }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backbufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => applyQuality(hls, quality));
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              onError?.("hls_error");
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    }

    return () => {
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, quality, onError]);

  useEffect(() => {
    if (hlsRef.current) applyQuality(hlsRef.current, quality);
  }, [quality]);

  function applyQuality(hls, q) {
    if (q === "auto") {
      hls.currentLevel = -1;
      return;
    }
    const targetHeight = parseInt(q, 10);
    const levelIndex = hls.levels.findIndex((l) => Math.abs(l.height - targetHeight) < 100);
    if (levelIndex >= 0) hls.currentLevel = levelIndex;
  }

  const toggleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    } else {
      el.requestFullscreen().then(() => setIsFullscreen(true));
    }
  };

  return (
    <div className="relative bg-black rounded-lg overflow-hidden group">
      <video
        ref={videoRef}
        className="w-full aspect-video"
        autoPlay={autoPlay}
        playsInline
        controls={false}
        poster={poster}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2">
          <button onClick={toggleFullscreen} className="text-white text-sm hover:text-brand-green-300 transition-colors px-2 py-1 rounded bg-black/50">
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>
    </div>
  );
}
