import { useCallback, useEffect, useRef, useState } from "react";
import { logError } from "../lib/logger.js";
import { editorMessages } from "../lib/editorMessages.js";
import { clamp, sourceToTimelineTime, timelineDuration, timelineToSourceTime } from "../lib/videoTimeline.js";
import useLanguage from "./useLanguage.jsx";

// Tracks the displayed video rectangle inside the preview stage.
export default function usePreviewBounds({ stageRef, sourceUrl, width, height }) {
  const [previewBounds, setPreviewBounds] = useState(null);

  useEffect(() => {
    if (!sourceUrl || !width || !height) {
      setPreviewBounds(null);
      return undefined;
    }

    function updatePreviewBounds() {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      const stageRect = stage.getBoundingClientRect();
      if (!stageRect.width || !stageRect.height) {
        return;
      }
      const scale = Math.min(stageRect.width / width, stageRect.height / height);
      const previewWidth = width * scale;
      const previewHeight = height * scale;
      setPreviewBounds({
        left: (stageRect.width - previewWidth) / 2,
        top: (stageRect.height - previewHeight) / 2,
        width: previewWidth,
        height: previewHeight
      });
    }

    updatePreviewBounds();
    const stage = stageRef.current;
    const resizeObserver = typeof ResizeObserver !== "undefined" && stage
      ? new ResizeObserver(updatePreviewBounds)
      : null;
    resizeObserver?.observe(stage);
    window.addEventListener("resize", updatePreviewBounds);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePreviewBounds);
    };
  }, [height, sourceUrl, stageRef, width]);

  return previewBounds;
}

// Synchronizes the editor playhead with the source video time.
export function usePlayheadPreview({ videoRef, totalDuration, segments, setPlayhead }) {
  return useCallback((nextPlayhead, timelineSegments = segments) => {
    const safeTime = clamp(Number(nextPlayhead) || 0, 0, totalDuration);
    setPlayhead(safeTime);
    const video = videoRef.current;
    if (!video) return;

    const sourceTime = timelineToSourceTime(timelineSegments, safeTime);
    if (Math.abs((Number(video.currentTime) || 0) - sourceTime) > 0.05) {
      video.currentTime = sourceTime;
    }
  }, [segments, setPlayhead, totalDuration, videoRef]);
}

// Owns the preview video's playback, loading feedback, and Web Audio graph.
export function usePreviewPlayback({
  videoRef,
  sourceUrl,
  duration,
  segments,
  playhead,
  onPlayheadChange,
  setErrorText,
  setStatus
}) {
  const { t } = useLanguage();
  const [previewLoadProgress, setPreviewLoadProgress] = useState(0);
  const [previewLoadedUntil, setPreviewLoadedUntil] = useState(0);
  const [previewLoadMessage, setPreviewLoadMessage] = useState(t("notLoaded"));
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
    setPreviewLoadMessage(sourceUrl ? t("previewLoading") : t("notLoaded"));
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
        ? t("previewReady")
        : progress > 0
          ? t("previewLoadingProgress", Math.round(progress))
          : t("previewLoading")
    );
  }

  function handlePreviewVideoLoadStart(event) {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage(t("previewLoading"));
    setIsPreviewReady(false);
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoReady(event) {
    setPreviewCurrentTime(Number(event.currentTarget.currentTime) || 0);
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoWaiting(event) {
    updatePreviewLoadState(event.currentTarget);
    setPreviewLoadMessage(t("previewLoadingMore"));
  }

  function handlePreviewVideoError() {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage(t("previewLoadFailed"));
    setIsPreviewReady(false);
  }

  function handlePreviewTimeUpdate(event) {
    const currentTime = Number(event.currentTarget.currentTime) || 0;
    setPreviewCurrentTime(currentTime);
    const timelineTime = sourceToTimelineTime(segments, currentTime, playhead);
    if (timelineTime !== null) {
      onPlayheadChange((current) => Math.abs(current - timelineTime) > 0.15 ? timelineTime : current);
    }
  }

  function handlePreviewEnded() {
    const video = videoRef.current;
    const totalDuration = timelineDuration(segments);
    if (!video || !segments.length) {
      setIsPreviewPlaying(false);
      return;
    }

    let cursor = 0;
    const currentTimelineTime = Number(playhead) || 0;
    for (const segment of segments) {
      const segmentDuration = Math.max(0, Number(segment.end) - Number(segment.start));
      const segmentEnd = cursor + segmentDuration;
      if (currentTimelineTime < segmentEnd - 0.05) {
        const nextTimelineTime = segmentEnd;
        if (nextTimelineTime < totalDuration) {
          const nextSourceTime = timelineToSourceTime(segments, nextTimelineTime + 0.01);
          if (nextSourceTime !== null) {
            video.currentTime = nextSourceTime;
            onPlayheadChange(nextTimelineTime);
            video.play().then(() => setIsPreviewPlaying(true)).catch(() => setIsPreviewPlaying(false));
            return;
          }
        }
        break;
      }
      cursor = segmentEnd;
    }
    setIsPreviewPlaying(false);
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
      setErrorText(t("previewPlaybackFailed"));
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
    setStatus(nextRate === 1 ? t("previewNormalSpeed") : t("previewSlowSpeed"));
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
    handlePreviewEnded,
    handlePreviewTimeUpdate,
    handleTogglePreviewPlayback,
    handleTogglePreviewSpeed,
    handlePreviewPlay: () => setIsPreviewPlaying(true),
    handlePreviewPause: () => setIsPreviewPlaying(false)
  };
}