import { useState, useRef, useCallback, useEffect } from 'react';
import { startStream, endStream as apiEndStream } from '../services/stream.service';
import {
  startBroadcast,
  stopBroadcast,
  isBroadcasting,
  getBroadcastStream,
  getBroadcastSlot,
  subscribeBroadcast,
} from '../lib/broadcast';

export default function useWebRTC() {
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  // The stream lives in state, not just a ref: CameraPreview only
  // re-attaches srcObject when this value actually changes identity.
  const [stream, setStream] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isLive, setIsLive] = useState(isBroadcasting());
  const [error, setError] = useState(null);

  const cleanup = useCallback(() => {
    // Never stop a live broadcast here — it is owned by the
    // module-scoped broadcast.js singleton so it survives page
    // navigation (Studio → Camera Mixer → Dashboard). Only stop
    // the local preview tracks when we're NOT broadcasting.
    if (!isBroadcasting() && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
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
  }, []);

  // ─────────────────────────────────────────
  // startAudioMeter(stream)
  // Drives the level meter for whichever stream is currently
  // previewed — including one adopted from a live broadcast.
  // ─────────────────────────────────────────
  const startAudioMeter = useCallback((source) => {
    if (!source || source.getAudioTracks().length === 0) return;

    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const node = ctx.createMediaStreamSource(source);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    node.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(avg / 255);
      animFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  }, []);

  // ─────────────────────────────────────────
  // Adopt a broadcast that started on a previous mount.
  // Navigating Studio → Camera Mixer unmounts this hook, but the
  // broadcast itself lives in the module singleton. Without this,
  // coming back to Studio would claim "No camera connected" while
  // the stream is actually still going out.
  // ─────────────────────────────────────────
  useEffect(() => {
    const existing = getBroadcastStream();
    if (existing && !streamRef.current) {
      streamRef.current = existing;
      setStream(existing);
      setCameraReady(true);
      startAudioMeter(existing);
    }
  }, [startAudioMeter]);

  // Keep isLive truthful even when the socket dies on its own.
  useEffect(() => subscribeBroadcast((on) => setIsLive(on)), []);

  const startCamera = useCallback(async (videoEl) => {
    if (isBroadcasting()) {
      setError('End the current broadcast before switching source');
      return null;
    }
    cleanup();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      setStream(stream);
      if (videoEl) videoEl.srcObject = stream;
      startAudioMeter(stream);
      setCameraReady(true);
      return stream;
    } catch (err) {
      setError('Could not access camera/microphone: ' + err.message);
      return null;
    }
  }, [cleanup, startAudioMeter]);

  const startScreenShare = useCallback(async (videoEl) => {
    if (isBroadcasting()) {
      setError('End the current broadcast before switching source');
      return null;
    }
    cleanup();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      setStream(stream);
      if (videoEl) videoEl.srcObject = stream;
      startAudioMeter(stream);

      stream.getVideoTracks()[0].onended = () => cleanup();
      setCameraReady(true);
      return stream;
    } catch (err) {
      setError('Could not share screen: ' + err.message);
      return null;
    }
  }, [cleanup, startAudioMeter]);

  // ─────────────────────────────────────────
  // goLive
  // Marks the stream live via the API, then hands the local
  // camera/screen stream to the module-scoped broadcast.js
  // singleton, which pushes webm chunks over the ingest socket and
  // survives React unmounts (page navigation).
  // ─────────────────────────────────────────
  const goLive = useCallback(async ({ title, description, event_id, slot }) => {
    if (!streamRef.current) {
      setError('No camera or screen share active');
      return false;
    }

    if (isBroadcasting()) {
      setError('Broadcast already in progress');
      setIsLive(true);
      return true;
    }

    try {
      const streamStatus = await startStream({ title, description, event_id });
      await startBroadcast({ stream: streamRef.current, slot: slot || 'cam1' });

      setError(null);
      setIsLive(true);
      return Boolean(streamStatus.id);
    } catch (err) {
      setError('Failed to go live: ' + err.message);
      return false;
    }
  }, []);

  const endLive = useCallback(async () => {
    // Stop the broadcast: recorder stops → final chunk flushed →
    // ingest socket closes → server closes FFmpeg stdin gracefully.
    stopBroadcast();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setCameraReady(false);
    setAudioLevel(0);

    try {
      await apiEndStream();
    } catch {}
    setIsLive(false);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    cameraReady,
    audioLevel,
    isLive,
    error,
    stream,
    liveSlot: isLive ? getBroadcastSlot() : null,
    startCamera,
    startScreenShare,
    goLive,
    endLive,
    clearError: () => setError(null),
  };
}