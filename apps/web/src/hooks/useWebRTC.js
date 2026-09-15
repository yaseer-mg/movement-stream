import { useState, useRef, useCallback, useEffect } from 'react';
import { startStream, endStream as apiEndStream } from '../services/stream.service';

export default function useWebRTC() {
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamWriterRef = useRef(null);
  const abortCtrlRef = useRef(null);
  const ingestSlotRef = useRef('cam1');

  const [cameraReady, setCameraReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState(null);

  const stopMediaRecorder = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch {}
    }
  }, []);

  const stopIngestStream = useCallback(() => {
    if (streamWriterRef.current) {
      try { streamWriterRef.current.close(); } catch {}
      streamWriterRef.current = null;
    }
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    stopMediaRecorder();
    stopIngestStream();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setCameraReady(false);
    setAudioLevel(0);
  }, [stopMediaRecorder, stopIngestStream]);

  const startCamera = useCallback(async (videoEl) => {
    cleanup();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      if (videoEl) videoEl.srcObject = stream;

      // Audio meter
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 255);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      setCameraReady(true);
      return stream;
    } catch (err) {
      setError('Could not access camera/microphone: ' + err.message);
      return null;
    }
  }, [cleanup]);

  const startScreenShare = useCallback(async (videoEl) => {
    cleanup();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoEl) videoEl.srcObject = stream;

      // Audio meter for screen share audio if available
      if (stream.getAudioTracks().length > 0) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(avg / 255);
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }

      stream.getVideoTracks()[0].onended = () => cleanup();
      setCameraReady(true);
      return stream;
    } catch (err) {
      setError('Could not share screen: ' + err.message);
      return null;
    }
  }, [cleanup]);

  // ─────────────────────────────────────────
  // sendLiveStream(slot)
  // Starts MediaRecorder on the local stream and streams
  // webm chunks to the media server via a single long-lived
  // POST request body. The request stays open until the
  // recorder stops, which mirrors "pushing" a live signal.
  // ─────────────────────────────────────────
  const sendLiveStream = useCallback(async (slot = 'cam1') => {
    const stream = streamRef.current;
    if (!stream) throw new Error('No camera or screen share active');

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    });

    const queue = new TransformStream();
    const writer = queue.writable.getWriter();
    const abortCtrl = new AbortController();

    mediaRecorderRef.current = recorder;
    streamWriterRef.current = writer;
    abortCtrlRef.current = abortCtrl;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        writer.write(e.data).catch(() => {});
      }
    };

    recorder.onerror = () => {
      setError('MediaRecorder failed — check camera/mic permissions');
      setIsLive(false);
    };

    recorder.onstop = () => {
      // Closing the writer ends the request body → server
      // finishes the final HLS segment and closes FFmpeg.
      writer.close().catch(() => {});
      streamWriterRef.current = null;
    };

    const mediaUrl = (import.meta.env.VITE_MEDIA_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');
    const response = await fetch(`${mediaUrl}/ingest/${slot}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/webm',
        'X-Camera-Slot': slot,
      },
      body: queue.readable,
      signal: abortCtrl.signal,
      // Don't auto-follow errors silently; surface network failures
    }).catch(() => null);

    if (!response) {
      throw new Error('Could not reach the ingest server');
    }
    if (abortCtrl.signal.aborted) return;

    recorder.start(1000);
    return recorder;
  }, []);

  const goLive = useCallback(async ({ title, description, event_id, slot }) => {
    if (!streamRef.current) {
      setError('No camera or screen share active');
      return false;
    }

    try {
      const streamStatus = await startStream({ title, description, event_id });
      ingestSlotRef.current = slot || 'cam1';

      // MediaRecorder + streaming POST replaces the old WHIP handshake.
      // The fetch request stays open for the whole broadcast; any network
      // failure surfaces via the error state instead of the caller.
      sendLiveStream(ingestSlotRef.current).catch((err) => {
        setError('Ingest failed: ' + err.message);
        setIsLive(false);
      });

      setError(null);
      setIsLive(true);
      return Boolean(streamStatus.id);
    } catch (err) {
      setError('Failed to go live: ' + err.message);
      return false;
    }
  }, [sendLiveStream]);

  const endLive = useCallback(async () => {
    // Stop the recorder → final chunk flushed → request body ends
    // → server closes FFmpeg stdin gracefully.
    stopMediaRecorder();
    // Let the final chunk drain, then stop camera tracks.
    setTimeout(() => {
      stopIngestStream();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    }, 800);

    try {
      await apiEndStream();
    } catch {}
    setIsLive(false);
  }, [stopMediaRecorder, stopIngestStream]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    cameraReady,
    audioLevel,
    isLive,
    error,
    stream: streamRef.current,
    startCamera,
    startScreenShare,
    goLive,
    endLive,
    clearError: () => setError(null),
  };
}