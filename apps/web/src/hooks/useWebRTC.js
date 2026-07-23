import { useState, useRef, useCallback, useEffect } from 'react';
import { startStream, endStream as apiEndStream } from '../services/stream.service';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function useWebRTC() {
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState(null);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
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
  }, []);

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

  const goLive = useCallback(async ({ title, description, event_id }) => {
    if (!streamRef.current) {
      setError('No camera or screen share active');
      return false;
    }

    try {
      const streamStatus = await startStream({ title, description, event_id });
      const streamId = streamStatus.id;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') resolve();
        };
        setTimeout(resolve, 3000);
      });

      const mediaUrl = import.meta.env.VITE_MEDIA_SERVER_URL || 'http://localhost:3001';
      const response = await fetch(`${mediaUrl}/whip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'X-Camera-Slot': 'cam1',
        },
        body: pc.localDescription.sdp,
      });

      if (!response.ok) throw new Error('WHIP endpoint rejected the offer');

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setIsLive(false);
        }
      };

      setIsLive(true);
      setError(null);
      return true;
    } catch (err) {
      setError('Failed to go live: ' + err.message);
      return false;
    }
  }, []);

  const endLive = useCallback(async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
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
    stream: streamRef.current,
    startCamera,
    startScreenShare,
    goLive,
    endLive,
    clearError: () => setError(null),
  };
}
