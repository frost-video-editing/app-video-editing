import { useEffect, useRef, useState } from "react";
import { logError } from "../lib/logger.js";
import { editorMessages } from "../lib/editorMessages.js";
import { clamp, sourceToTimelineTime } from "../lib/videoTimeline.js";

// Owns the preview video's playback, loading feedback, and Web Audio graph.
export default function usePreviewPlayback({
  videoRef,
  sourceUrl,
  duration,
  segments,
  onPlayheadChange,
  setErrorText,
  setStatus
}) {
  const [previewLoadProgress, setPreviewLoadProgress] = useState(0);
  const [previewLoadedUntil, setPreviewLoadedUntil] = useState(0);
  const [previewLoadMessage, setPreviewLoadMessage] = useState("未読み込み");
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewPlaybackRate, setPreviewPlaybackRate] = useState(1);
  const [audioGainPercent, setAudioGainPercent] = useState(100);
  const [audioNormalize, setAudioNormalize] = useState(false);
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioGainNodeRef = useRef(null);
  const audioCompressorRef = useRef(null);

  useEffect(() => {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage(sourceUrl ? editorMessages.previewLoading : "未読み込み");
    setIsPreviewReady(false);
    setPreviewCurrentTime(0);
    setIsPreviewPlaying(false);
  }, [sourceUrl]);

  function updatePreviewLoadState(video) {
    if (!video) {
      return;
    }

    const videoDuration = Math.max(0, Number(video.duration) || Number(duration) || 0);
    let bufferedUntil = 0;
    if (video.buffered?.length) {
      for (let index = 0; index < video.buffered.length; index += 1) {
        bufferedUntil = Math.max(bufferedUntil, Number(video.buffered.end(index)) || 0);
      }
    }

    const loadedUntil = videoDuration > 0 ? clamp(bufferedUntil, 0, videoDuration) : 0;
    const isComplete = (videoDuration > 0 && loadedUntil >= Math.max(videoDuration - 0.25, videoDuration * 0.98)) || video.readyState >= 4;
    const progress = isComplete ? 100 : videoDuration > 0 ? (loadedUntil / videoDuration) * 100 : video.readyState >= 1 ? 15 : 0;

    setPreviewLoadedUntil(isComplete ? videoDuration : loadedUntil);
    setPreviewLoadProgress(progress);
    setIsPreviewReady(isComplete);
    setPreviewLoadMessage(
      isComplete
        ? editorMessages.previewReady
        : progress > 0
          ? editorMessages.previewLoadingProgress(progress)
          : editorMessages.previewLoading
    );
  }

  function handlePreviewVideoLoadStart(event) {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage(editorMessages.previewLoading);
    setIsPreviewReady(false);
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoReady(event) {
    setPreviewCurrentTime(Number(event.currentTarget.currentTime) || 0);
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoWaiting(event) {
    updatePreviewLoadState(event.currentTarget);
    setPreviewLoadMessage(editorMessages.previewLoadingMore);
  }

  function handlePreviewVideoError() {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage(editorMessages.previewLoadFailed);
    setIsPreviewReady(false);
  }

  function handlePreviewTimeUpdate(event) {
    const currentTime = Number(event.currentTarget.currentTime) || 0;
    setPreviewCurrentTime(currentTime);
    const timelineTime = sourceToTimelineTime(segments, currentTime);
    if (timelineTime !== null) {
      onPlayheadChange((current) => Math.abs(current - timelineTime) > 0.15 ? timelineTime : current);
    }
  }

  async function handleTogglePreviewPlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    try {
      if (video.paused) {
        await video.play();
        setIsPreviewPlaying(true);
      } else {
        video.pause();
        setIsPreviewPlaying(false);
      }
    } catch (error) {
      console.error("Failed to toggle preview playback", error);
      setErrorText(editorMessages.previewPlaybackFailed);
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    try {
      if (audioContextRef.current == null && typeof window !== "undefined" && window.AudioContext) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const context = audioContextRef.current;
      if (!context || !video) {
        return;
      }

      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.disconnect();
        } catch (error) {
          logError("usePreviewPlayback.audioSource.disconnect", error);
        }
      }

      const source = context.createMediaElementSource(video);
      audioSourceRef.current = source;
      if (!audioGainNodeRef.current) {
        audioGainNodeRef.current = context.createGain();
      }
      if (!audioCompressorRef.current) {
        audioCompressorRef.current = context.createDynamicsCompressor();
      }

      const gainNode = audioGainNodeRef.current;
      const compressor = audioCompressorRef.current;
      if (audioNormalize) {
        source.connect(compressor);
        compressor.connect(gainNode);
      } else {
        source.connect(gainNode);
      }
      gainNode.connect(context.destination);
    } catch (error) {
      logError("usePreviewPlayback.audio.init", error);
    }
  }, [sourceUrl, videoRef]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = previewPlaybackRate;
    }
  }, [previewPlaybackRate, videoRef]);

  useEffect(() => {
    const context = audioContextRef.current;
    const gainNode = audioGainNodeRef.current;
    if (!context || !gainNode) {
      return;
    }

    const linearGain = Math.max(0, (Number(audioGainPercent) || 100) / 100);
    try {
      gainNode.gain.cancelScheduledValues(context.currentTime);
      gainNode.gain.setValueAtTime(linearGain, context.currentTime);
    } catch (error) {
      logError("usePreviewPlayback.gain.setValue", error);
    }

    const source = audioSourceRef.current;
    const compressor = audioCompressorRef.current;
    if (!source || !compressor) {
      return;
    }
    try {
      source.disconnect();
      compressor.disconnect();
      if (audioNormalize) {
        source.connect(compressor);
        compressor.connect(gainNode);
      } else {
        source.connect(gainNode);
      }
    } catch (error) {
      logError("usePreviewPlayback.audio.reconnect", error);
    }
  }, [audioGainPercent, audioNormalize]);

  function handleTogglePreviewSpeed() {
    const nextRate = previewPlaybackRate === 1 ? 0.5 : 1;
    setPreviewPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
    setStatus(nextRate === 1 ? "プレビュー速度を通常に戻しました。" : "プレビュー速度を低速（0.5×）にしました。");
  }

  return {
    previewLoadProgress,
    previewLoadedUntil,
    previewLoadMessage,
    isPreviewReady,
    previewCurrentTime,
    setPreviewCurrentTime,
    isPreviewPlaying,
    previewPlaybackRate,
    audioGainPercent,
    setAudioGainPercent,
    audioNormalize,
    setAudioNormalize,
    handlePreviewVideoLoadStart,
    handlePreviewVideoProgress: (event) => updatePreviewLoadState(event.currentTarget),
    handlePreviewVideoReady,
    handlePreviewVideoWaiting,
    handlePreviewVideoError,
    handlePreviewTimeUpdate,
    handleTogglePreviewPlayback,
    handleTogglePreviewSpeed,
    handlePreviewPlay: () => setIsPreviewPlaying(true),
    handlePreviewPause: () => setIsPreviewPlaying(false)
  };
}