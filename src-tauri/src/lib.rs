// Tauri backend for the local video editor.
// Mirrors the Electron IPC surface: select-source / backup-source / probe-video /
// select-output / export-video / cancel-export. The Go video-exporter binary and
// the FFmpeg / FFprobe binaries are reused unchanged; only the shell layer is
// re-implemented on top of Tauri v2.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_notification::NotificationExt;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const EXPORT_PROGRESS_EVENT: &str = "editor:export-progress";

/// Shared state that tracks the currently running Go exporter process so it
/// can be terminated by cancel_export.
#[derive(Default)]
struct ExportState {
    child: Mutex<Option<Child>>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectSourceResponse {
    file_path: String,
    file_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FilePathResponse {
    file_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeVideoResponse {
    duration: f64,
    width: u32,
    height: u32,
    has_audio: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CancelResponse {
    cancelled: bool,
}

#[derive(Deserialize)]
struct BackupSourceArgs {
    #[serde(alias = "filePath")]
    file_path: Option<String>,
}

#[derive(Deserialize, Default)]
struct SelectOutputArgs {
    #[serde(default, alias = "suggestedName")]
    suggested_name: Option<String>,
}

#[derive(Deserialize)]
struct WritePresetFileArgs {
    #[serde(alias = "filePath")]
    file_path: String,
    contents: String,
}

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

/// Try each candidate name inside a directory and return the first that exists.
fn first_existing(dir: &Path, candidates: &[&str]) -> Option<PathBuf> {
    for name in candidates {
        let path = dir.join(name);
        if path.exists() {
            return Some(path);
        }
    }
    None
}

/// Resolve a bundled binary path. Search order:
/// 1. The Tauri resource directory (populated by `npm run tauri:prepare`).
/// 2. Development fallbacks under the workspace: node_modules for FFmpeg /
///    FFprobe, and `go/` for the Go exporter.
fn resolve_bundled_binary(app: &AppHandle, kind: BinaryKind) -> Option<PathBuf> {
    let (bundle_names, dev_candidates) = match kind {
        BinaryKind::Ffmpeg => (
            vec!["ffmpeg.exe", "ffmpeg"],
            vec![
                "node_modules/ffmpeg-static/ffmpeg.exe",
                "node_modules/ffmpeg-static/ffmpeg",
            ],
        ),
        BinaryKind::Ffprobe => (
            vec!["ffprobe.exe", "ffprobe"],
            vec![
                "node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe",
                "node_modules/ffprobe-static/bin/darwin/x64/ffprobe",
                "node_modules/ffprobe-static/bin/darwin/arm64/ffprobe",
                "node_modules/ffprobe-static/bin/linux/x64/ffprobe",
            ],
        ),
        BinaryKind::Exporter => (
            vec!["video-exporter.exe", "video-exporter"],
            vec!["go/video-exporter.exe", "go/video-exporter"],
        ),
    };

    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(found) = first_existing(&resource_dir, &bundle_names) {
            return Some(found);
        }
    }

    // Development fallback: walk up from the src-tauri manifest directory to
    // find the workspace root and then look for the well-known dev locations.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(workspace_root) = manifest_dir.parent() {
        for rel in &dev_candidates {
            let candidate = workspace_root.join(rel);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

enum BinaryKind {
    Ffmpeg,
    Ffprobe,
    Exporter,
}

// ---------------------------------------------------------------------------
// Dialog commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn select_source(app: AppHandle) -> Result<Option<SelectSourceResponse>, String> {
    let app_for_dialog = app.clone();
    let file_path = tokio::task::spawn_blocking(move || {
        app_for_dialog
            .dialog()
            .file()
            .set_title("動画を選択")
            .add_filter("Video", &["mp4", "mov", "mkv", "webm", "m4v", "avi"])
            .add_filter("All files", &["*"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("dialog task failed: {e}"))?;

    let Some(picked) = file_path else {
        return Ok(None);
    };

    let path = filepath_to_pathbuf(picked).ok_or("Unsupported file path scheme")?;
    let file_name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(Some(SelectSourceResponse {
        file_path: path.to_string_lossy().to_string(),
        file_name,
    }))
}

#[tauri::command]
async fn backup_source(
    app: AppHandle,
    payload: Option<BackupSourceArgs>,
) -> Result<Option<FilePathResponse>, String> {
    let source_path = payload
        .and_then(|p| p.file_path)
        .ok_or("バックアップ元のパスが渡されていません。")?;
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("バックアップ元の動画が見つかりません。".into());
    }

    let default_name = source
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "video.mp4".into());
    let downloads = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let ext = source
        .extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "mp4".into());

    let app_for_dialog = app.clone();
    let dest = tokio::task::spawn_blocking(move || {
        app_for_dialog
            .dialog()
            .file()
            .set_title("バックアップの保存先を選択")
            .set_directory(&downloads)
            .set_file_name(&default_name)
            .add_filter("Video file", &[ext.as_str()])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("dialog task failed: {e}"))?;

    let Some(dest) = dest else {
        return Ok(None);
    };
    let dest_path = filepath_to_pathbuf(dest).ok_or("Unsupported file path scheme")?;

    tokio::fs::copy(&source, &dest_path)
        .await
        .map_err(|e| format!("バックアップに失敗しました: {e}"))?;

    Ok(Some(FilePathResponse {
        file_path: dest_path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
async fn select_output(
    app: AppHandle,
    payload: Option<SelectOutputArgs>,
) -> Result<Option<FilePathResponse>, String> {
    let suggested_name = payload
        .and_then(|p| p.suggested_name)
        .unwrap_or_else(|| "edited-video.mp4".into());
    let downloads = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    let app_for_dialog = app.clone();
    let picked = tokio::task::spawn_blocking(move || {
        app_for_dialog
            .dialog()
            .file()
            .set_title("出力先を選択")
            .set_directory(&downloads)
            .set_file_name(&suggested_name)
            .add_filter("MP4 Video", &["mp4"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("dialog task failed: {e}"))?;

    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = filepath_to_pathbuf(picked).ok_or("Unsupported file path scheme")?;
    Ok(Some(FilePathResponse {
        file_path: path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
async fn select_preset_output(
    app: AppHandle,
) -> Result<Option<FilePathResponse>, String> {
    let downloads = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    let app_for_dialog = app.clone();
    let picked = tokio::task::spawn_blocking(move || {
        app_for_dialog
            .dialog()
            .file()
            .set_title("クロッププリセットの保存先を選択")
            .set_directory(&downloads)
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("dialog task failed: {e}"))?;

    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = filepath_to_pathbuf(picked).ok_or("Unsupported file path scheme")?;
    Ok(Some(FilePathResponse {
        file_path: path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
async fn write_preset_file(payload: WritePresetFileArgs) -> Result<FilePathResponse, String> {
    let path = PathBuf::from(&payload.file_path);
    tokio::fs::write(&path, payload.contents)
        .await
        .map_err(|e| format!("プリセットの保存に失敗しました: {e}"))?;
    Ok(FilePathResponse {
        file_path: path.to_string_lossy().to_string(),
    })
}

// ---------------------------------------------------------------------------
// Probe (ffprobe)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn probe_video(
    app: AppHandle,
    payload: Value,
) -> Result<ProbeVideoResponse, String> {
    let file_path = extract_probe_path(&payload)?;
    let ffprobe = resolve_bundled_binary(&app, BinaryKind::Ffprobe)
        .ok_or("ffprobe が見つかりません。")?;
    if !Path::new(&file_path).exists() {
        return Err("動画ファイルが見つかりません。".into());
    }

    let output = Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &file_path,
        ])
        .output()
        .await
        .map_err(|e| format!("ffprobe の起動に失敗しました: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe が失敗しました: {}", stderr.trim()));
    }

    let json: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("ffprobe 出力の解析に失敗しました: {e}"))?;

    let streams = json.get("streams").and_then(|v| v.as_array());
    let video_stream = streams
        .and_then(|arr| arr.iter().find(|s| s.get("codec_type").and_then(|v| v.as_str()) == Some("video")));
    let audio_stream = streams
        .and_then(|arr| arr.iter().find(|s| s.get("codec_type").and_then(|v| v.as_str()) == Some("audio")));

    let duration = json
        .get("format")
        .and_then(|v| v.get("duration"))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .or_else(|| {
            video_stream
                .and_then(|s| s.get("duration"))
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<f64>().ok())
        })
        .unwrap_or(0.0);

    let width = video_stream
        .and_then(|s| s.get("width"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let height = video_stream
        .and_then(|s| s.get("height"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    Ok(ProbeVideoResponse {
        duration: if duration.is_finite() { duration } else { 0.0 },
        width,
        height,
        has_audio: audio_stream.is_some(),
    })
}

fn extract_probe_path(payload: &Value) -> Result<String, String> {
    if let Some(s) = payload.as_str() {
        return Ok(s.to_string());
    }
    if let Some(obj) = payload.as_object() {
        if let Some(v) = obj.get("filePath").and_then(|v| v.as_str()) {
            return Ok(v.to_string());
        }
        if let Some(v) = obj.get("file_path").and_then(|v| v.as_str()) {
            return Ok(v.to_string());
        }
    }
    Err("probe_video: filePath is required".into())
}

// ---------------------------------------------------------------------------
// Export (Go exporter)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn export_video(
    app: AppHandle,
    state: State<'_, Arc<ExportState>>,
    payload: Value,
) -> Result<Value, String> {
    let exporter = resolve_bundled_binary(&app, BinaryKind::Exporter)
        .ok_or("Go 版の動画出力エンジンが見つかりません。先に npm run build:exporter を実行してください。")?;
    let ffmpeg = resolve_bundled_binary(&app, BinaryKind::Ffmpeg)
        .ok_or("ffmpeg が見つかりません。")?;

    let payload_bytes = serde_json::to_vec(&payload)
        .map_err(|e| format!("payload の直列化に失敗しました: {e}"))?;

    let mut command = Command::new(&exporter);
    command
        .env("FFMPEG_PATH", &ffmpeg)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW keeps the console hidden, mirroring windowsHide: true.
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("動画出力エンジンの起動に失敗しました: {e}"))?;

    let mut stdin = child.stdin.take().ok_or("stdin を取得できませんでした")?;
    let stdout = child.stdout.take().ok_or("stdout を取得できませんでした")?;
    let stderr = child.stderr.take();

    {
        let mut guard = state.child.lock().await;
        *guard = Some(child);
    }

    // Feed the JSON payload to the exporter and close stdin so it starts working.
    tokio::spawn(async move {
        let _ = stdin.write_all(&payload_bytes).await;
        let _ = stdin.shutdown().await;
    });

    // Collect stderr for diagnostics (helps when the Go binary crashes early).
    if let Some(mut stderr) = stderr {
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut buf = Vec::new();
            let _ = stderr.read_to_end(&mut buf).await;
            if !buf.is_empty() {
                eprintln!(
                    "[video-exporter] stderr: {}",
                    String::from_utf8_lossy(&buf)
                );
            }
        });
    }

    let mut lines = BufReader::new(stdout).lines();
    let mut result_value: Option<Value> = None;
    let mut error_message: Option<String> = None;

    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let Ok(msg) = serde_json::from_str::<Value>(trimmed) else {
                    continue;
                };
                match msg.get("type").and_then(|v| v.as_str()) {
                    Some("progress") => {
                        let _ = app.emit(EXPORT_PROGRESS_EVENT, msg);
                    }
                    Some("result") => {
                        result_value = Some(msg);
                    }
                    Some("error") => {
                        error_message = Some(
                            msg.get("message")
                                .and_then(|v| v.as_str())
                                .unwrap_or("動画出力に失敗しました。")
                                .to_string(),
                        );
                    }
                    _ => {}
                }
            }
            Ok(None) => break,
            Err(err) => {
                error_message.get_or_insert_with(|| format!("stdout 読み取りエラー: {err}"));
                break;
            }
        }
    }

    // Reap the child and clear the shared handle so a subsequent cancel does
    // not try to kill an already-exited process.
    let exit_status = {
        let mut guard = state.child.lock().await;
        if let Some(mut child) = guard.take() {
            child.wait().await.ok()
        } else {
            None
        }
    };

    if let Some(message) = error_message {
        if message == "EXPORT_CANCELLED" {
            return Err("EXPORT_CANCELLED".into());
        }
        return Err(message);
    }

    if let Some(status) = exit_status {
        if !status.success() {
            // If the exporter was killed by cancel_export the exit status will
            // not be a normal success; treat that as the cancellation path.
            return Err("EXPORT_CANCELLED".into());
        }
    }

    let result = result_value
        .ok_or_else(|| "動画出力エンジンから結果が返りませんでした。".to_string())?;

    // Fire a system notification to match Electron's Notification behaviour.
    if let Some(paths) = result
        .get("outputPaths")
        .and_then(|v| v.as_array())
    {
        let body = format!("{} 個のファイルを出力しました。", paths.len());
        let _ = app
            .notification()
            .builder()
            .title("Video Editing")
            .body(&body)
            .show();
    }

    Ok(result)
}

#[tauri::command]
async fn cancel_export(state: State<'_, Arc<ExportState>>) -> Result<CancelResponse, String> {
    let mut guard = state.child.lock().await;
    if let Some(child) = guard.as_mut() {
        // start_kill sends TerminateProcess on Windows and SIGKILL on Unix.
        let _ = child.start_kill();
    }
    Ok(CancelResponse { cancelled: true })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Convert a Tauri FilePath into a PathBuf, discarding non-filesystem URIs.
fn filepath_to_pathbuf(fp: FilePath) -> Option<PathBuf> {
    match fp {
        FilePath::Path(p) => Some(p),
        FilePath::Url(url) => url.to_file_path().ok(),
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Arc::new(ExportState::default()))
        .invoke_handler(tauri::generate_handler![
            select_source,
            backup_source,
            probe_video,
            select_output,
            select_preset_output,
            write_preset_file,
            export_video,
            cancel_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
