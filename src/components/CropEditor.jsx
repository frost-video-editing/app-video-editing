import React from "react";
import { CropControls } from "./button/crop.jsx";

// Renders the video preview and all crop-specific controls.
export default function CropEditor({
  stageRef,
  videoRef,
  sourceUrl,
  isCropSelecting,
  previewBounds,
  previewViewportStyle,
  previewVideoStyle,
  currentCropBoxStyle,
  draftCropBoxStyle,
  hasCrop,
  cropDraft,
  isCropPreviewLocked,
  isPreviewReady,
  isPreviewPlaying,
  previewPlaybackRate,
  previewCurrentTime,
  duration,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onTimeUpdate,
  onSeeked,
  onPlay,
  onPause,
  onEnded,
  onLoadStart,
  onLoadedMetadata,
  onLoadedData,
  onCanPlay,
  onCanPlayThrough,
  onProgress,
  onWaiting,
  onError,
  onTogglePlayback,
  onToggleSpeed,
  cropControlsProps
}) {
  return (
    <>
      <div
        ref={stageRef}
        className={`preview-stage${isCropSelecting ? " preview-stage--crop-mode" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {sourceUrl ? (
          <>
            <div
              className={`preview-video-viewport${isCropPreviewLocked && hasCrop ? " preview-video-viewport--cropped" : ""}`}
              style={previewViewportStyle}
            >
              <video
                key={sourceUrl}
                ref={videoRef}
                className="preview-video"
                src={sourceUrl}
                style={previewVideoStyle}
                playsInline
                onTimeUpdate={onTimeUpdate}
                onSeeked={onSeeked}
                onPlay={onPlay}
                onPause={onPause}
                onEnded={onEnded}
                onLoadStart={onLoadStart}
                onLoadedMetadata={onLoadedMetadata}
                onLoadedData={onLoadedData}
                onCanPlay={onCanPlay}
                onCanPlayThrough={onCanPlayThrough}
                onProgress={onProgress}
                onWaiting={onWaiting}
                onError={onError}
              />
            </div>
            {previewBounds && (!isCropPreviewLocked || isCropSelecting) ? (
              <div
                className={`preview-crop-overlay${isCropSelecting ? " preview-crop-overlay--interactive" : ""}`}
                style={{
                  left: `${previewBounds.left}px`,
                  top: `${previewBounds.top}px`,
                  width: `${previewBounds.width}px`,
                  height: `${previewBounds.height}px`
                }}
              >
                {hasCrop && !cropDraft && currentCropBoxStyle ? (
                  <div className="preview-crop-selection" style={currentCropBoxStyle}>
                    <span className="preview-crop-selection__label">現在の crop</span>
                  </div>
                ) : null}
                {cropDraft && draftCropBoxStyle ? (
                  <div className="preview-crop-selection preview-crop-selection--draft" style={draftCropBoxStyle}>
                    <span className="preview-crop-selection__label">選択中</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="preview-empty">動画を読み込むとここにプレビューが表示されます。</div>
        )}
      </div>

      {sourceUrl ? (
        <div className="preview-transport">
          <button type="button" className="secondary-button" onClick={onTogglePlayback} disabled={!isPreviewReady}>
            {isPreviewPlaying ? "停止" : "再生"}
          </button>
          <button
            type="button"
            className={previewPlaybackRate === 1 ? "ghost-button" : "secondary-button"}
            onClick={onToggleSpeed}
            disabled={!isPreviewReady}
          >
            {previewPlaybackRate === 1 ? "低速" : "通常"}
          </button>
          <span className="preview-transport__time">{previewCurrentTime} / {duration}</span>
          <span className="preview-transport__hint">再生位置の変更は下のタイムラインで行います。</span>
        </div>
      ) : null}

      <CropControls {...cropControlsProps} />
    </>
  );
}
