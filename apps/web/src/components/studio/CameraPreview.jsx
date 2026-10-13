import { useRef, useEffect, useState } from 'react';

export default function CameraPreview({ stream, source = 'camera' }) {
  const videoRef = useRef(null);
  const [facingMode, setFacingMode] = useState(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    const track = stream?.getVideoTracks?.()[0];
    setFacingMode(track?.getSettings?.().facingMode ?? null);
  }, [stream]);

  // Only mirror a selfie/front camera. The rear camera and screen shares
  // must render unflipped so text isn't reversed.
  const isRearCamera = facingMode === 'environment' || facingMode === 'back';
  const mirrored = source === 'camera' && !isRearCamera;

  return (
    <div className="relative bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full aspect-video object-cover"
        style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
      />
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-12 h-12 text-brand-light-muted mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-brand-light-muted text-sm">No camera connected</p>
          </div>
        </div>
      )}
    </div>
  );
}
