import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";
import { app, BrowserWindow, dialog, ipcMain, Notification } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const ffmpegStatic = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");

const isDev = !app.isPackaged;
let mainWindow = null;
const EXPORT_PROGRESS_CHANNEL = "editor:export-progress";
const activeFfmpegProcesses = new Set();
let exportCancellationRequested = false;

function createExportCancelledError() {
  const error = new Error("EXPORT_CANCELLED");
  error.code = "EXPORT_CANCELLED";
  return error;
}

function resolveBinaryPath(binary) {
  const binaryPath = typeof binary === "string" ? binary : binary?.path || binary?.default || null;
  if (!binaryPath) {
    return null;
  }

  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  const asarSegment = `${path.sep}app.asar${path.sep}`;
  if (!binaryPath.includes(asarSegment)) {
    return binaryPath;
  }

  const unpackedPath = binaryPath.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`);
  return fs.existsSync(unpackedPath) ? unpackedPath : binaryPath;
}

function getUnpackedBinaryPath(binaryPath) {
  if (!binaryPath) {
    return binaryPath;
  }

  const asarSegment = `${path.sep}app.asar${path.sep}`;
  if (!binaryPath.includes(asarSegment)) {
    return binaryPath;
  }

  return binaryPath.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`);
}

function resolveBundledBinary(binary, packageName, ...binaryParts) {
  const resolvedPath = resolveBinaryPath(binary);
  const candidates = [
    path.join(process.resourcesPath, packageName === "ffmpeg-static" ? "ffmpeg" : "ffprobe", binaryParts.at(-1)),
    resolvedPath,
    path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", packageName, ...binaryParts),
    path.join(process.resourcesPath, "node_modules", packageName, ...binaryParts)
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || resolvedPath;
}

const ffmpegBinary = resolveBundledBinary(ffmpegStatic, "ffmpeg-static", "ffmpeg.exe");
const ffprobeBinary = resolveBundledBinary(ffprobeStatic, "ffprobe-static", "bin", "ffprobe.exe");

function runCommand(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const spawnOptions = {
      windowsHide: true,
      shell: false,
      ...options
    };
    let stdout = "";
    let stderr = "";
    let settled = false;

    function finishError(error) {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    }

    function finishSuccess(result) {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    }

    function startProcess(binaryPath, allowRetry) {
      const fallbackBinary = getUnpackedBinaryPath(binaryPath);
      const nextBinary = fs.existsSync(binaryPath)
        ? binaryPath
        : allowRetry && fallbackBinary && fallbackBinary !== binaryPath && fs.existsSync(fallbackBinary)
          ? fallbackBinary
          : binaryPath;
      let handedOffToRetry = false;

      function retryWithFallback() {
        if (!allowRetry || handedOffToRetry || !fallbackBinary || fallbackBinary === nextBinary || !fs.existsSync(fallbackBinary)) {
          return false;
        }

        handedOffToRetry = true;
        startProcess(fallbackBinary, false);
        return true;
      }

      if (!nextBinary || !fs.existsSync(nextBinary)) {
        finishError(new Error(`Command binary not found: ${binaryPath || "unknown"}`));
        return;
      }

      let child;
      try {
        child = spawn(nextBinary, args, spawnOptions);
      } catch (error) {
        if (retryWithFallback()) {
          return;
        }

        finishError(error);
        return;
      }

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (error?.code === "ENOENT" && retryWithFallback()) {
          return;
        }

        finishError(error);
      });

      child.on("close", (code) => {
        if (settled || handedOffToRetry) {
          return;
        }

        if (code === 0) {
          finishSuccess({ stdout, stderr });
          return;
        }

        if (code === -4058 && retryWithFallback()) {
          return;
        }

        finishError(new Error(stderr.trim() || `Command failed with exit code ${code}`));
      });
    }

    startProcess(resolveBinaryPath(binary), true);
  });
}

function parseFfmpegProgressTime(progressState) {
  const outTimeUs = Number(progressState.out_time_us);
  if (Number.isFinite(outTimeUs) && outTimeUs >= 0) {
    return outTimeUs / 1000000;
  }

  const outTimeMs = Number(progressState.out_time_ms);
  if (Number.isFinite(outTimeMs) && outTimeMs >= 0) {
    return outTimeMs / 1000000;
  }

  const outTime = String(progressState.out_time || "").trim();
  if (!outTime) {
    return null;
  }

  const parts = outTime.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;
  const seconds = Number(parts[2]) || 0;
  return (hours * 3600) + (minutes * 60) + seconds;
}

function runFfmpegWithProgress(args, {
  totalDuration = 0,
  startProgress = 0,
  endProgress = 100,
  onProgress,
  progressMessage = "動画を出力中..."
} = {}) {
  return new Promise((resolve, reject) => {
    if (exportCancellationRequested) {
      reject(createExportCancelledError());
      return;
    }

    const resolvedBinary = resolveBinaryPath(ffmpegBinary);
    const ffmpegArgs = ["-progress", "pipe:1", "-nostats", ...args];
    const spawnOptions = {
      windowsHide: true,
      shell: false
    };
    let settled = false;
    let stdout = "";
    let stderr = "";
    let progressBuffer = "";
    let lastProgressValue = startProgress;

    function finishError(error) {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    }

    function finishSuccess(result) {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    }

    function emitProgress(progressState = {}) {
      if (typeof onProgress !== "function" || totalDuration <= 0) {
        return;
      }

      const processedSeconds = parseFfmpegProgressTime(progressState);
      if (!Number.isFinite(processedSeconds)) {
        return;
      }

      const ratio = Math.min(1, Math.max(0, processedSeconds / totalDuration));
      const progress = startProgress + ((endProgress - startProgress) * ratio);
      if (progress <= lastProgressValue && progressState.progress !== "end") {
        return;
      }

      lastProgressValue = progress;
      onProgress({
        progress,
        processedSeconds,
        totalDuration,
        message: `${progressMessage} ${progress.toFixed(1)}%`
      });
    }

    function handleProgressChunk(chunkText) {
      progressBuffer += chunkText;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || "";
      const progressState = {};

      for (const line of lines) {
        if (!line.includes("=")) {
          continue;
        }

        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        progressState[key] = value;

        if (key === "progress") {
          emitProgress(progressState);
        }
      }
    }

    function spawnProcess(binaryPath, allowRetry) {
      const fallbackBinary = getUnpackedBinaryPath(binaryPath);
      const nextBinary = fs.existsSync(binaryPath)
        ? binaryPath
        : allowRetry && fallbackBinary && fallbackBinary !== binaryPath && fs.existsSync(fallbackBinary)
          ? fallbackBinary
          : binaryPath;
      let handedOffToRetry = false;

      function retryWithFallback() {
        if (exportCancellationRequested || !allowRetry || handedOffToRetry || !fallbackBinary || fallbackBinary === nextBinary || !fs.existsSync(fallbackBinary)) {
          return false;
        }

        handedOffToRetry = true;
        spawnProcess(fallbackBinary, false);
        return true;
      }

      if (!nextBinary || !fs.existsSync(nextBinary)) {
        finishError(new Error(`Command binary not found: ${binaryPath || "unknown"}`));
        return;
      }

      let child;
      try {
        child = spawn(nextBinary, ffmpegArgs, spawnOptions);
        activeFfmpegProcesses.add(child);
      } catch (error) {
        if (retryWithFallback()) {
          return;
        }

        finishError(error);
        return;
      }

      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        handleProgressChunk(text);
      });

      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        activeFfmpegProcesses.delete(child);
        if (exportCancellationRequested) {
          finishError(createExportCancelledError());
          return;
        }
        if (error?.code === "ENOENT" && retryWithFallback()) {
          return;
        }

        finishError(error);
      });

      child.on("close", (code) => {
        activeFfmpegProcesses.delete(child);
        if (settled || handedOffToRetry) {
          return;
        }

        if (exportCancellationRequested) {
          finishError(createExportCancelledError());
          return;
        }

        if (code === 0) {
          if (typeof onProgress === "function") {
            onProgress({
              progress: endProgress,
              processedSeconds: totalDuration,
              totalDuration,
              message: `${progressMessage} ${endProgress.toFixed(1)}%`
            });
          }
          finishSuccess({ stdout, stderr });
          return;
        }

        if (code === -4058 && retryWithFallback()) {
          return;
        }

        finishError(new Error(stderr.trim() || `Command failed with exit code ${code}`));
      });
    }

    spawnProcess(resolvedBinary, true);
  });
}

function cancelActiveExport() {
  exportCancellationRequested = true;
  for (const child of activeFfmpegProcesses) {
    child.kill();
  }
  return { cancelled: true };
}

function formatTimestamp(value) {
  return Math.max(0, Number(value) || 0).toFixed(3);
}

function normalizeCrop(crop, width, height) {
  const maxCropSum = 99;
  const clampPercent = (value) => Math.min(maxCropSum, Math.max(0, Number(value) || 0));
  const scaleAxis = (start, end) => {
    const total = start + end;
    if (total <= maxCropSum) {
      return [start, end];
    }

    const scale = maxCropSum / total;
    return [start * scale, end * scale];
  };
  const left = clampPercent(crop?.left);
  const top = clampPercent(crop?.top);
  const right = clampPercent(crop?.right);
  const bottom = clampPercent(crop?.bottom);

  const [scaledLeft, scaledRight] = scaleAxis(left, right);
  const [scaledTop, scaledBottom] = scaleAxis(top, bottom);

  const cropWidth = Math.max(2, Math.floor((width * (1 - (scaledLeft + scaledRight) / 100)) / 2) * 2);
  const cropHeight = Math.max(2, Math.floor((height * (1 - (scaledTop + scaledBottom) / 100)) / 2) * 2);
  const x = Math.max(0, Math.min(width - cropWidth, Math.floor((width * scaledLeft) / 100)));
  const y = Math.max(0, Math.min(height - cropHeight, Math.floor((height * scaledTop) / 100)));

  return {
    left: scaledLeft,
    top: scaledTop,
    right: scaledRight,
    bottom: scaledBottom,
    cropWidth,
    cropHeight,
    x,
    y
  };
}

function buildCropFilter(crop, width, height) {
  const normalized = normalizeCrop(crop, width, height);
  if (normalized.left === 0 && normalized.top === 0 && normalized.right === 0 && normalized.bottom === 0) {
    return null;
  }
  return `crop=${normalized.cropWidth}:${normalized.cropHeight}:${normalized.x}:${normalized.y}`;
}

function isNearlyEqual(left, right, epsilon = 0.05) {
  return Math.abs((Number(left) || 0) - (Number(right) || 0)) <= epsilon;
}

function buildSegmentOutputPath(baseOutputPath, index, totalSegments) {
  if (totalSegments <= 1) {
    return baseOutputPath;
  }

  const parsed = path.parse(baseOutputPath);
  const digits = Math.max(2, String(totalSegments).length);
  return path.join(parsed.dir, `${parsed.name}-part-${String(index + 1).padStart(digits, "0")}${parsed.ext || ".mp4"}`);
}

function buildTimelineProgressMessage(title, totalSegments, currentSegment = 0, currentSegmentProgress = 0) {
  const safeTotalSegments = Math.max(0, Number(totalSegments) || 0);
  const safeCurrentSegment = Math.max(0, Math.min(safeTotalSegments, Number(currentSegment) || 0));
  const safeCurrentProgress = Math.max(0, Math.min(100, Number(currentSegmentProgress) || 0));
  const lines = [title];

  for (let index = 1; index <= safeTotalSegments; index += 1) {
    const progress = index < safeCurrentSegment ? 100 : index === safeCurrentSegment ? safeCurrentProgress : 0;
    lines.push(`タイムライン${index}: ${progress.toFixed(1)}%`);
  }

  return lines.join("\n");
}

function buildTimelineProgressDetails(title, totalSegments, currentSegment = 0, currentSegmentProgress = 0) {
  const safeTotalSegments = Math.max(0, Number(totalSegments) || 0);
  const safeCurrentSegment = Math.max(0, Math.min(safeTotalSegments, Number(currentSegment) || 0));
  const safeCurrentProgress = Math.max(0, Math.min(100, Number(currentSegmentProgress) || 0));
  const segments = [];

  for (let index = 1; index <= safeTotalSegments; index += 1) {
    const progress = index < safeCurrentSegment ? 100 : index === safeCurrentSegment ? safeCurrentProgress : 0;
    segments.push(Number(progress.toFixed(1)));
  }

  const textLines = [title, ...segments.map((p, i) => `タイムライン${i + 1}: ${p}%`)];
  return { text: textLines.join("\n"), segments };
}

function getExportProfile(name) {
  const profiles = {
    fast: { preset: "ultrafast", crf: "23", gpuPreset: "p1", gpuQuality: "23" },
    standard: { preset: "veryfast", crf: "18", gpuPreset: "p4", gpuQuality: "19" },
    high: { preset: "slow", crf: "16", gpuPreset: "p6", gpuQuality: "17" },
    gpu: { preset: "veryfast", crf: "20", gpuPreset: "p1", gpuQuality: "21" }
  };

  return profiles[name] || profiles.standard;
}

function getVideoEncodingArgs(videoEncoder, profile, videoThreads = 0) {
  if (videoEncoder === "h264_nvenc") {
    return ["-c:v", "h264_nvenc", "-preset", profile.gpuPreset, "-tune", "hq", "-rc", "vbr", "-cq", profile.gpuQuality, "-b:v", "0"];
  }

  if (videoEncoder === "h264_qsv") {
    return ["-c:v", "h264_qsv", "-preset", profile.gpuPreset === "p1" ? "veryfast" : "medium", "-global_quality", profile.gpuQuality];
  }

  if (videoEncoder === "h264_amf") {
    return ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", profile.gpuQuality, "-qp_p", profile.gpuQuality];
  }

  return ["-c:v", "libx264", "-preset", profile.preset, "-crf", profile.crf, "-threads", String(videoThreads)];
}

async function exportSingleSegment({
  sourcePath,
  outputPath,
  segment,
  sourceInfo,
  cropFilter,
  preserveCropResolution = true,
  cropScaleAlgorithm = "lanczos",
  exportProfile = "standard",
  videoThreads = 0,
  videoEncoder = "libx264",
  audioOptions = {},
  startProgress,
  endProgress,
  progressMessage,
  currentSegment,
  totalSegments,
  segmentsProgressArray = null,
  segmentIndex = null
}) {
  const profile = getExportProfile(exportProfile);
  const videoPreset = profile.preset;
  const videoCrf = profile.crf;

  const hasAudioAdjustments = audioOptions && (
    (Number.isFinite(Number(audioOptions.gainDb)) && Number(audioOptions.gainDb) !== 0) ||
    (Number(audioOptions.fadeIn) > 0) ||
    (Number(audioOptions.fadeOut) > 0) ||
    Boolean(audioOptions.normalize)
  );

  if (!cropFilter && !hasAudioAdjustments) {
    try {
      const fastArgs = ["-y"];

      if (segment.start > 0) {
        fastArgs.push("-ss", formatTimestamp(segment.start));
      }

      if (!isNearlyEqual(segment.duration, sourceInfo.duration)) {
        fastArgs.push("-t", formatTimestamp(segment.duration));
      }

      fastArgs.push("-i", sourcePath, "-c", "copy", "-movflags", "+faststart", outputPath);
      await runFfmpegWithProgress(fastArgs, {
        totalDuration: segment.duration,
        startProgress,
        endProgress,
        progressMessage,
        onProgress: ({ progress, processedSeconds, totalDuration }) => {
          const segmentProgress = totalDuration > 0 ? (processedSeconds / totalDuration) * 100 : 0;
          if (Array.isArray(segmentsProgressArray) && typeof segmentIndex === "number") {
            segmentsProgressArray[segmentIndex - 1] = Number(segmentProgress.toFixed(1));
            const textLines = [progressMessage, ...segmentsProgressArray.map((p, i) => `タイムライン${i + 1}: ${p}%`)];
            sendExportProgress({
              progress,
              message: textLines.join("\n"),
              segments: [...segmentsProgressArray],
              currentSegment,
              totalSegments,
              indeterminate: false
            });
          } else {
            const d = buildTimelineProgressDetails(progressMessage, totalSegments, currentSegment, segmentProgress);
            sendExportProgress({
              progress,
              message: d.text,
              segments: d.segments,
              currentSegment,
              totalSegments,
              indeterminate: false
            });
          }
        }
      });
      return;
    } catch {
      sendExportProgress({
        progress: startProgress,
        ...(() => { const d = buildTimelineProgressDetails(`${progressMessage}\n高速モードが使えないため通常モードに切り替えます...`, totalSegments, currentSegment, 0); return { message: d.text, segments: d.segments }; })(),
        currentSegment,
        totalSegments,
        indeterminate: true
      });
    }
  }

  const args = ["-y"];

  if (segment.start > 0) {
    args.push("-ss", formatTimestamp(segment.start));
  }

  if (!isNearlyEqual(segment.duration, sourceInfo.duration)) {
    args.push("-t", formatTimestamp(segment.duration));
  }

  args.push("-i", sourcePath);

  if (cropFilter) {
    // Scale back only when the user chooses to retain the source dimensions.
    const targetWidth = Number(sourceInfo.width) || null;
    const targetHeight = Number(sourceInfo.height) || null;
    const scaleFlags = cropScaleAlgorithm === "bilinear" ? "bilinear" : "lanczos";
    const scaleFilter = preserveCropResolution && targetWidth && targetHeight
      ? `,scale=${targetWidth}:${targetHeight}:flags=${scaleFlags}`
      : "";
    const vfFilter = `${cropFilter}${scaleFilter}`;
    let videoEncodingArgs;
    if (videoEncoder === "h264_nvenc") {
      videoEncodingArgs = [
        "-c:v", "h264_nvenc",
        "-preset", profile.gpuPreset,
        "-tune", "hq",
        "-rc", "vbr",
        "-cq", profile.gpuQuality,
        "-b:v", "0"
      ];
    } else if (videoEncoder === "h264_qsv") {
      videoEncodingArgs = [
        "-c:v", "h264_qsv",
        "-preset", profile.gpuPreset === "p1" ? "veryfast" : "medium",
        "-global_quality", profile.gpuQuality
      ];
    } else if (videoEncoder === "h264_amf") {
      videoEncodingArgs = [
        "-c:v", "h264_amf",
        "-quality", "quality",
        "-rc", "cqp",
        "-qp_i", profile.gpuQuality,
        "-qp_p", profile.gpuQuality
      ];
    } else {
      videoEncodingArgs = [
        "-c:v", "libx264",
        "-preset", videoPreset,
        "-crf", videoCrf,
        "-x264-params", "aq-mode=3:aq-strength=1.0",
        "-threads", String(videoThreads)
      ];
    }

    args.push(
      "-vf", vfFilter,
      ...videoEncodingArgs,
      "-profile:v", "high",
      "-pix_fmt", "yuv420p"
    );
    if (sourceInfo.hasAudio) {
      // build audio filter chain if adjustments requested
      const afilters = [];
      const gainPercent = Number(audioOptions.gainPercent || 100);
      const multiplier = Math.max(0, gainPercent / 100);
      if (Number.isFinite(multiplier) && multiplier !== 1) afilters.push(`volume=${multiplier}`);
      if (audioOptions.normalize) afilters.push("dynaudnorm");

      if (afilters.length > 0) {
        args.push("-af", afilters.join(","));
      }

      args.push("-c:a", "aac", "-b:a", "192k");
    } else {
      args.push("-an");
    }
  } else if (sourceInfo.hasAudio) {
    // no crop, but we may still need audio adjustments; include -af when requested
    const afilters = [];
    const gainPercent = Number(audioOptions.gainPercent || 100);
    const multiplier = Math.max(0, gainPercent / 100);
    if (Number.isFinite(multiplier) && multiplier !== 1) afilters.push(`volume=${multiplier}`);
    if (audioOptions.normalize) afilters.push("dynaudnorm");

    args.push(...getVideoEncodingArgs(videoEncoder, profile), "-pix_fmt", "yuv420p");
    if (afilters.length > 0) args.push("-af", afilters.join(","));
    args.push("-c:a", "aac", "-b:a", "192k");
  } else {
    args.push(...getVideoEncodingArgs(videoEncoder, profile), "-pix_fmt", "yuv420p", "-an");
  }

  args.push("-movflags", "+faststart", outputPath);
  try {
    await runFfmpegWithProgress(args, {
      totalDuration: segment.duration,
      startProgress,
      endProgress,
      progressMessage,
      onProgress: ({ progress, processedSeconds, totalDuration }) => {
        const segmentProgress = totalDuration > 0 ? (processedSeconds / totalDuration) * 100 : 0;
        if (Array.isArray(segmentsProgressArray) && typeof segmentIndex === "number") {
          segmentsProgressArray[segmentIndex - 1] = Number(segmentProgress.toFixed(1));
          const textLines = [progressMessage, ...segmentsProgressArray.map((p, i) => `タイムライン${i + 1}: ${p}%`)];
          sendExportProgress({
            progress,
            message: textLines.join("\n"),
            segments: [...segmentsProgressArray],
            currentSegment,
            totalSegments,
            indeterminate: false
          });
        } else {
          const d = buildTimelineProgressDetails(progressMessage, totalSegments, currentSegment, segmentProgress);
          sendExportProgress({
            progress,
            message: d.text,
            segments: d.segments,
            currentSegment,
            totalSegments,
            indeterminate: false
          });
        }
      }
    });
  } catch (error) {
    if (videoEncoder === "libx264") {
      throw error;
    }

    console.warn(`${videoEncoder} export failed; retrying the segment with CPU encoding.`, error);
    sendExportProgress({
      progress: startProgress,
      message: `${progressMessage}\nGPU エンコードを利用できないため CPU エンコードに切り替えます...`,
      currentSegment,
      totalSegments,
      indeterminate: true
    });
    await exportSingleSegment({
      sourcePath,
      outputPath,
      segment,
      sourceInfo,
      cropFilter,
      preserveCropResolution,
      cropScaleAlgorithm,
      exportProfile,
      videoThreads,
      videoEncoder: "libx264",
      audioOptions,
      startProgress,
      endProgress,
      progressMessage,
      currentSegment,
      totalSegments,
      segmentsProgressArray,
      segmentIndex
    });
  }
}

function sendExportProgress(progressUpdate) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(EXPORT_PROGRESS_CHANNEL, progressUpdate);
}

function notifyExportComplete(outputPaths) {
  if (!Notification.isSupported()) {
    return;
  }

  try {
    const fileCount = outputPaths.length;
    const body = `${fileCount} 個のファイルを出力しました。`;
    new Notification({
      title: "Video Editing",
      body
    }).show();
  } catch (error) {
    console.warn("Export completion notification could not be shown.", error);
  }
}

async function probeVideo(filePath) {
  if (!ffprobeBinary) {
    throw new Error("ffprobe-static が見つかりません。");
  }

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("動画ファイルが見つかりません。");
  }

  const { stdout } = await runCommand(ffprobeBinary, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ]);

  const data = JSON.parse(stdout);
  const videoStream = data.streams?.find((stream) => stream.codec_type === "video");
  const audioStream = data.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(data.format?.duration || videoStream?.duration || 0);

  return {
    duration: Number.isFinite(duration) ? duration : 0,
    width: Number(videoStream?.width || 0),
    height: Number(videoStream?.height || 0),
    hasAudio: Boolean(audioStream)
  };
}

async function pickSourceVideo() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "動画を選択",
    properties: ["openFile"],
    filters: [
      { name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "m4v", "avi"] },
      { name: "All files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    filePath,
    fileUrl: pathToFileURL(filePath).href,
    fileName: path.basename(filePath)
  };
}

async function backupSourceVideo(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error("バックアップ元の動画が見つかりません。");
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "バックアップの保存先を選択",
    defaultPath: path.join(app.getPath("downloads"), path.basename(sourcePath)),
    filters: [{ name: "Video file", extensions: [path.extname(sourcePath).slice(1) || "mp4"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.promises.copyFile(sourcePath, result.filePath);
  return { filePath: result.filePath };
}

async function pickOutputVideo(suggestedName = "edited-video.mp4") {
  const downloadsDir = app.getPath("downloads");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "出力先を選択",
    defaultPath: path.join(downloadsDir, suggestedName),
    filters: [{ name: "MP4 Video", extensions: ["mp4"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return { filePath: result.filePath };
}

async function exportVideoLegacy(payload = {}) {
  if (!ffmpegBinary) {
    throw new Error("ffmpeg-static が見つかりません。");
  }

  const sourcePath = String(payload.sourcePath || "");
  const outputPath = String(payload.outputPath || "");
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  const crop = payload.crop || null;
  const preserveCropResolution = payload.preserveCropResolution !== false;
  const cropScaleAlgorithm = payload.cropScaleAlgorithm === "bilinear" ? "bilinear" : "lanczos";
  const exportProfile = ["fast", "standard", "high", "gpu"].includes(payload.exportProfile)
    ? payload.exportProfile
    : "standard";
  const separateFiles = Boolean(payload.separateFiles);

  if (!sourcePath || !outputPath || !segments.length) {
    throw new Error("出力に必要な情報が足りません。");
  }

  exportCancellationRequested = false;

  sendExportProgress({
    progress: 5,
    ...(() => {
      const d = buildTimelineProgressDetails("出力準備中...", segments.length, 0, 0);
      return { message: d.text, segments: d.segments };
    })(),
    currentSegment: 0,
    totalSegments: segments.length,
    indeterminate: false
  });

  const sourceInfo = await probeVideo(sourcePath);
  const cropFilter = buildCropFilter(crop, sourceInfo.width || 1, sourceInfo.height || 1);
  // audio adjustment options from payload (percent-based volume)
  const audioOptions = {
    gainPercent: payload.audioGainPercent != null ? Number(payload.audioGainPercent) : 100,
    normalize: Boolean(payload.audioNormalize)
  };
  const hasAudioAdjustments = (Number.isFinite(audioOptions.gainPercent) && Number(audioOptions.gainPercent) !== 100) || audioOptions.normalize;
  const needsVideoEncode = cropFilter || hasAudioAdjustments;
  const videoEncoder = "libx264";
  const validSegments = segments
    .map((segment) => {
      const start = Math.max(0, Number(segment.start) || 0);
      const end = Math.max(start, Number(segment.end) || 0);
      return {
        start,
        end,
        duration: end - start
      };
    })
    .filter((segment) => segment.duration > 0);
  const totalSegments = validSegments.length;

  if (!totalSegments) {
    throw new Error("出力できるセグメントがありません。");
  }

  const totalDuration = validSegments.reduce((sum, segment) => sum + segment.duration, 0);
  const outputPaths = [];
  let processedDuration = 0;

  sendExportProgress({
    progress: 16,
    ...(() => {
      const d = buildTimelineProgressDetails(`タイムラインごとに出力中... (${totalSegments}件)`, totalSegments, 0, 0);
      return { message: d.text, segments: d.segments };
    })(),
    currentSegment: 0,
    totalSegments,
    indeterminate: false
  });

  // Prepare prefix durations so we can compute stable start/end percentages per segment
  const prefixDurations = [];
  let acc = 0;
  for (const seg of validSegments) {
    prefixDurations.push(acc);
    acc += seg.duration;
  }

  // Keep outputs independent while limiting each encoder so two crop jobs can share the CPU.
  const cpuCount = Math.max(1, (os.cpus() || []).length || 1);
  const concurrency = cropFilter
    ? (cpuCount >= 4 ? 2 : 1)
    : Math.min(4, Math.max(1, Math.floor(cpuCount / 2)));
  const videoThreads = cropFilter ? Math.max(1, Math.floor(cpuCount / concurrency)) : 0;

  let nextIndex = 0;
  let completedDuration = 0;
  const outputPathsByIndex = new Array(totalSegments);
  const segmentsProgressArray = new Array(totalSegments).fill(0);

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= totalSegments) break;

      const segment = validSegments[index];
      const segmentOutputPath = buildSegmentOutputPath(outputPath, index, totalSegments);
      const startProgress = 18 + ((prefixDurations[index] / Math.max(totalDuration, 1)) * 81.5);
      const endProgress = 18 + (((prefixDurations[index] + segment.duration) / Math.max(totalDuration, 1)) * 81.5);

      try {
        await exportSingleSegment({
          sourcePath,
          outputPath: segmentOutputPath,
          segment,
          sourceInfo,
          cropFilter,
          preserveCropResolution,
          cropScaleAlgorithm,
          exportProfile,
          videoThreads,
          videoEncoder,
          audioOptions,
          startProgress,
          endProgress,
          progressMessage: `タイムライン ${index + 1}/${totalSegments} を出力中...`,
          currentSegment: index + 1,
          totalSegments,
          segmentsProgressArray,
          segmentIndex: index + 1
        });

        outputPathsByIndex[index] = segmentOutputPath;
      } catch (err) {
        // Re-throw to abort overall export
        throw err;
      } finally {
        // Update overall progress based on completedDuration
        completedDuration += segment.duration;
        const overallProgress = 18 + ((completedDuration / Math.max(totalDuration, 1)) * 81.5);
        const d = buildTimelineProgressDetails(`セグメント ${index + 1} 完了`, totalSegments, index + 1, 100);
        sendExportProgress({
          progress: Math.min(100, overallProgress),
          message: d.text,
          segments: d.segments,
          currentSegment: index + 1,
          totalSegments,
          indeterminate: false
        });
      }
    }
  }

  // Launch workers
  const workers = [];
  for (let i = 0; i < concurrency; i += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);

  // collect output paths in order
  for (let i = 0; i < totalSegments; i += 1) {
    if (outputPathsByIndex[i]) outputPaths.push(outputPathsByIndex[i]);
  }

  sendExportProgress({
    progress: 100,
    message: buildTimelineProgressMessage(`${outputPaths.length} 件のファイル出力が完了しました。`, totalSegments, totalSegments, 100),
    currentSegment: totalSegments,
    totalSegments,
    indeterminate: false
  });

  return { outputPath: outputPaths[0] || outputPath, outputPaths };
  

  sendExportProgress({
    progress: 12,
    message: `セグメントを準備中... (${totalSegments}件)`,
    currentSegment: 0,
    totalSegments,
    indeterminate: false
  });

  if (!cropFilter && totalSegments === 1) {
    const [segment] = validSegments;

    sendExportProgress({
      progress: 20,
      message: "高速モードで出力中...",
      currentSegment: 0,
      totalSegments,
      indeterminate: true
    });

    try {
      const fastArgs = ["-y"];

      if (segment.start > 0) {
        fastArgs.push("-ss", formatTimestamp(segment.start));
      }

      if (!isNearlyEqual(segment.duration, sourceInfo.duration)) {
        fastArgs.push("-t", formatTimestamp(segment.duration));
      }

      fastArgs.push("-i", sourcePath, "-c", "copy", "-movflags", "+faststart", outputPath);
      await runFfmpegWithProgress(fastArgs, {
        totalDuration: segment.duration,
        startProgress: 20,
        endProgress: 99.5,
        progressMessage: "高速モードで出力中...",
        onProgress: ({ progress, message }) => {
          sendExportProgress({
            progress,
            message,
            currentSegment: totalSegments,
            totalSegments,
            indeterminate: false
          });
        }
      });

      sendExportProgress({
        progress: 100,
        message: "高速モードで出力が完了しました。",
        currentSegment: totalSegments,
        totalSegments,
        indeterminate: false
      });

      return { outputPath };
    } catch (error) {
      if (error?.code === "EXPORT_CANCELLED") {
        throw error;
      }
      sendExportProgress({
        progress: 22,
        message: "高速モードが使えないため通常モードに切り替えます...",
        currentSegment: 0,
        totalSegments,
        indeterminate: true
      });
    }
  }

  const filterParts = [];
  const concatInputs = [];

  validSegments.forEach((segment, index) => {
    const videoLabel = `v${index}`;
    const videoFilters = [
      `trim=start=${formatTimestamp(segment.start)}:end=${formatTimestamp(segment.end)}`,
      "setpts=PTS-STARTPTS"
    ];

    if (cropFilter) {
      videoFilters.push(cropFilter);
    }

    filterParts.push(`[0:v]${videoFilters.join(",")}[${videoLabel}]`);
    concatInputs.push(`[${videoLabel}]`);

    if (sourceInfo.hasAudio) {
      const audioLabel = `a${index}`;
      const audioFilters = [
        `atrim=start=${formatTimestamp(segment.start)}:end=${formatTimestamp(segment.end)}`,
        "asetpts=PTS-STARTPTS"
      ];

      if (hasAudioAdjustments) {
        const gainPercent = Number(audioOptions.gainPercent || 100);
        const multiplier = Math.max(0, gainPercent / 100);
        if (Number.isFinite(multiplier) && multiplier !== 1) audioFilters.push(`volume=${multiplier}`);
        if (audioOptions.normalize) audioFilters.push("dynaudnorm");
      }

      filterParts.push(
        `[0:a]${audioFilters.join(",")}[${audioLabel}]`
      );
      concatInputs.push(`[${audioLabel}]`);
    }
  });

  filterParts.push(
    `${concatInputs.join("")}concat=n=${totalSegments}:v=1:a=${sourceInfo.hasAudio ? 1 : 0}[vout]${sourceInfo.hasAudio ? "[aout]" : ""}`
  );

  sendExportProgress({
    progress: 24,
    message: cropFilter ? "切り出しと crop を一括で出力中..." : "切り出しと連結を一括で出力中...",
    currentSegment: 0,
    totalSegments,
    indeterminate: false
  });

  const args = [
    "-y",
    "-i",
    sourcePath,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]",
    "-c:v",
    "libx264",
    "-preset",
    videoPreset,
    "-crf",
    videoCrf,
    "-pix_fmt",
    "yuv420p",
    "-threads",
    "0"
  ];

  if (sourceInfo.hasAudio) {
    args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-an");
  }

  args.push("-movflags", "+faststart", outputPath);
  await runFfmpegWithProgress(args, {
    totalDuration: validSegments.reduce((sum, segment) => sum + segment.duration, 0),
    startProgress: 24,
    endProgress: 99.5,
    progressMessage: cropFilter ? "切り出しと crop を一括で出力中..." : "切り出しと連結を一括で出力中...",
    onProgress: ({ progress, message }) => {
      sendExportProgress({
        progress,
        message,
        currentSegment: totalSegments,
        totalSegments,
        indeterminate: false
      });
    }
  });

  sendExportProgress({
    progress: 100,
    message: "出力が完了しました。",
    currentSegment: totalSegments,
    totalSegments,
    indeterminate: false
  });

  return { outputPath };
}

// invoke the Go video exporter
function getGoExporterPath() {
  const executableName = process.platform === "win32" ? "video-exporter.exe" : "video-exporter";
  const unpackedResourcesPath = process.resourcesPath.replace(
    `${path.sep}app.asar`,
    `${path.sep}app.asar.unpacked`
  );
  const candidates = [
    path.join(process.resourcesPath, "app.asar.unpacked", "go", executableName),
    path.join(unpackedResourcesPath, "go", executableName),
    path.join(process.resourcesPath, "go", executableName),
    path.join(app.getAppPath(), "go", executableName),
    path.join(__dirname, "..", "..", "go", executableName)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function exportVideo(payload = {}) {
  const exporterPath = getGoExporterPath();
  if (!exporterPath) {
    throw new Error("Go版の動画出力エンジンが見つかりません。先に npm run build:exporter を実行してください。");
  }

  const sourcePath = String(payload.sourcePath || "");
  const outputPath = String(payload.outputPath || "");
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  if (!sourcePath || !outputPath || !segments.length) {
    throw new Error("出力に必要な情報が足りません。");
  }

  exportCancellationRequested = false;
  return new Promise((resolve, reject) => {
    const child = spawn(exporterPath, [], {
      windowsHide: true,
      shell: false,
      env: { ...process.env, FFMPEG_PATH: ffmpegBinary || "" }
    });
    activeFfmpegProcesses.add(child);
    let pendingOutput = "";
    let stderr = "";
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      activeFfmpegProcesses.delete(child);
      callback(value);
    };

    child.stdout.on("data", (chunk) => {
      pendingOutput += chunk.toString();
      const lines = pendingOutput.split(/\r?\n/);
      pendingOutput = lines.pop() || "";
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          if (message.type === "progress") sendExportProgress(message);
          if (message.type === "result") finish(resolve, message);
          if (message.type === "error") finish(reject, new Error(message.message || "動画出力に失敗しました。"));
        } catch {
          // Ignore incomplete runner output.
        }
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (settled) return;
      if (exportCancellationRequested) {
        finish(reject, createExportCancelledError());
      } else {
        finish(reject, new Error(stderr.trim() || `Go export failed with exit code ${code}`));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Video Editing",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }

  ipcMain.handle("editor:select-source", async () => pickSourceVideo());
  ipcMain.handle("editor:backup-source", async (_event, payload) => backupSourceVideo(payload?.filePath || payload));
  ipcMain.handle("editor:probe-video", async (_event, payload) => {
    const filePath = typeof payload === "string" ? payload : payload?.filePath;
    return probeVideo(String(filePath || ""));
  });
  ipcMain.handle("editor:select-output", async (_event, payload) => pickOutputVideo(payload?.suggestedName || "edited-video.mp4"));
  ipcMain.handle("editor:export-video", async (_event, payload) => {
    const result = await exportVideo(payload);
    notifyExportComplete(result.outputPaths || [result.outputPath]);
    return result;
  });
  ipcMain.handle("editor:cancel-export", async () => cancelActiveExport());

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
