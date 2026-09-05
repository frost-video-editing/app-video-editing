package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
)

type Segment struct {
	Start     float64 `json:"start"`
	End       float64 `json:"end"`
	AudioOnly bool    `json:"audioOnly"`
}

type Request struct {
	SourcePath             string             `json:"sourcePath"`
	OutputPath             string             `json:"outputPath"`
	Segments               []Segment          `json:"segments"`
	Crop                   map[string]float64 `json:"crop"`
	PreserveCropResolution bool               `json:"preserveCropResolution"`
	ExportProfile          string             `json:"exportProfile"`
	AudioGainPercent       float64            `json:"audioGainPercent"`
	AudioNormalize         bool               `json:"audioNormalize"`
	AudioOnly              bool               `json:"audioOnly"`
}

func formatNumber(value float64) string { return strconv.FormatFloat(value, 'f', 3, 64) }

func cropFilter(request Request) string {
	if len(request.Crop) == 0 {
		return ""
	}
	left, top := request.Crop["left"], request.Crop["top"]
	right, bottom := request.Crop["right"], request.Crop["bottom"]
	if left == 0 && top == 0 && right == 0 && bottom == 0 {
		return ""
	}
	return fmt.Sprintf("crop=iw*(1-%g-%g)/2*2:ih*(1-%g-%g)/2*2:iw*%g:ih*%g", left/100, right/100, top/100, bottom/100, left/100, top/100)
}

func encodingArgs(profile string) []string {
	preset, crf := "veryfast", "18"
	switch profile {
	case "fast":
		preset, crf = "ultrafast", "23"
	case "high":
		preset, crf = "slow", "16"
	case "gpu":
		preset, crf = "veryfast", "20"
	}
	return []string{"-c:v", "libx264", "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p", "-threads", "0"}
}

var outputMu sync.Mutex

func emit(value any) {
	outputMu.Lock()
	defer outputMu.Unlock()
	data, _ := json.Marshal(value)
	fmt.Println(string(data))
}

func detectEncoder(ffmpeg string) string {
	command := exec.Command(ffmpeg, "-hide_banner", "-encoders")
	data, err := command.CombinedOutput()
	if err != nil {
		return "libx264"
	}
	available := string(data)
	for _, encoder := range []string{"h264_nvenc", "h264_qsv", "h264_amf"} {
		if strings.Contains(available, encoder) {
			return encoder
		}
	}
	return "libx264"
}

// videoE
func videoEncodingArgs(encoder, profile string, threads int) []string {
	if encoder == "h264_nvenc" {
		preset, quality := "p4", "19"
		if profile == "fast" || profile == "gpu" {
			preset, quality = "p1", "21"
		}
		if profile == "high" {
			preset, quality = "p6", "17"
		}
		return []string{"-c:v", encoder, "-preset", preset, "-tune", "hq", "-rc", "vbr", "-cq", quality, "-b:v", "0"}
	}
	if encoder == "h264_qsv" {
		quality := "19"
		if profile == "fast" || profile == "gpu" {
			quality = "21"
		}
		if profile == "high" {
			quality = "17"
		}
		return []string{"-c:v", encoder, "-preset", "medium", "-global_quality", quality}
	}
	if encoder == "h264_amf" {
		quality := "19"
		if profile == "fast" || profile == "gpu" {
			quality = "21"
		}
		if profile == "high" {
			quality = "17"
		}
		return []string{"-c:v", encoder, "-quality", "quality", "-rc", "cqp", "-qp_i", quality, "-qp_p", quality}
	}
	args := encodingArgs(profile)
	if threads > 0 {
		args[len(args)-1] = strconv.Itoa(threads)
	}
	return args
}

func parseProgressTime(line string) (float64, bool) {
	var value float64
	switch {
	case strings.HasPrefix(line, "out_time_us="):
		value, _ = strconv.ParseFloat(strings.TrimPrefix(line, "out_time_us="), 64)
		value /= 1000000
	case strings.HasPrefix(line, "out_time_ms="):
		value, _ = strconv.ParseFloat(strings.TrimPrefix(line, "out_time_ms="), 64)
		value /= 1000000
	case strings.HasPrefix(line, "out_time="):
		parts := strings.Split(strings.TrimPrefix(line, "out_time="), ":")
		if len(parts) != 3 {
			return 0, false
		}
		hours, hoursErr := strconv.ParseFloat(parts[0], 64)
		minutes, minutesErr := strconv.ParseFloat(parts[1], 64)
		seconds, secondsErr := strconv.ParseFloat(parts[2], 64)
		if hoursErr != nil || minutesErr != nil || secondsErr != nil {
			return 0, false
		}
		value = (hours * 3600) + (minutes * 60) + seconds
	default:
		return 0, false
	}
	return value, math.IsNaN(value) == false && math.IsInf(value, 0) == false && value >= 0
}

func exportSegment(request Request, ffmpeg, encoder string, index int, segment Segment, output string, filter string, adjustAudio bool, threads int, progress []float64, progressMu *sync.Mutex, totalDuration float64) error {
	duration := segment.End - segment.Start
	args := []string{"-y", "-progress", "pipe:1", "-stats_period", "0.25", "-nostats"}
	if segment.Start > 0 {
		args = append(args, "-ss", formatNumber(segment.Start))
	}
	args = append(args, "-t", formatNumber(duration), "-i", request.SourcePath)
	if request.AudioOnly || segment.AudioOnly {
		args = append(args, "-vn")
		if adjustAudio {
			audioFilter := fmt.Sprintf("volume=%g", request.AudioGainPercent/100)
			if request.AudioNormalize {
				audioFilter += ",dynaudnorm"
			}
			args = append(args, "-af", audioFilter, "-c:a", "aac", "-b:a", "192k")
		} else {
			args = append(args, "-c:a", "copy")
		}
		args = append(args, "-movflags", "+faststart", output)
		command := exec.Command(ffmpeg, args...)
		command.Stderr = os.Stderr
		return command.Run()
	}
	if filter == "" && !adjustAudio {
		args = append(args, "-c", "copy")
	} else {
		if filter != "" {
			videoFilter := filter
			if request.PreserveCropResolution {
				videoFilter += ",scale=iw:ih"
			}
			args = append(args, "-vf", videoFilter)
		}
		args = append(args, videoEncodingArgs(encoder, request.ExportProfile, threads)...)
		if adjustAudio {
			audioFilter := fmt.Sprintf("volume=%g", request.AudioGainPercent/100)
			if request.AudioNormalize {
				audioFilter += ",dynaudnorm"
			}
			args = append(args, "-af", audioFilter)
		}
		args = append(args, "-c:a", "aac", "-b:a", "192k")
	}
	args = append(args, "-movflags", "+faststart", output)
	command := exec.Command(ffmpeg, args...)
	stdout, err := command.StdoutPipe()
	if err != nil {
		return err
	}
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		return err
	}
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		value, ok := parseProgressTime(scanner.Text())
		if !ok {
			continue
		}
		segmentProgress := value / duration * 100
		progressMu.Lock()
		if segmentProgress < 0 {
			segmentProgress = 0
		}
		if segmentProgress > 100 {
			segmentProgress = 100
		}
		progress[index] = segmentProgress
		completed := 0.0
		for item, value := range progress {
			completed += (value / 100) * (request.Segments[item].End - request.Segments[item].Start)
		}
		segments := append([]float64(nil), progress...)
		progressMu.Unlock()
		overall := 18 + completed/totalDuration*81.5
		emit(map[string]any{"type": "progress", "progress": overall, "message": fmt.Sprintf("タイムライン %d/%d を出力中... %.1f%%", index+1, len(request.Segments), segmentProgress), "currentSegment": index + 1, "currentSegmentProgress": segmentProgress, "totalSegments": len(request.Segments), "segments": segments, "indeterminate": false})
	}
	return command.Wait()
}

// export the video segments based on the request
func main() {
	var request Request
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		emit(map[string]any{"type": "error", "message": err.Error()})
		os.Exit(1)
	}
	if request.SourcePath == "" || request.OutputPath == "" || len(request.Segments) == 0 {
		emit(map[string]any{"type": "error", "message": "出力に必要な情報が足りません。"})
		os.Exit(1)
	}

	ffmpeg := os.Getenv("FFMPEG_PATH")
	if ffmpeg == "" {
		ffmpeg = "ffmpeg"
	}
	filter := cropFilter(request)
	adjustAudio := request.AudioNormalize || (request.AudioGainPercent != 0 && request.AudioGainPercent != 100)
	validSegments := make([]Segment, 0, len(request.Segments))
	for _, segment := range request.Segments {
		if segment.End > segment.Start {
			validSegments = append(validSegments, segment)
		}
	}
	if len(validSegments) == 0 {
		emit(map[string]any{"type": "error", "message": "出力できるセグメントがありません。"})
		os.Exit(1)
	}
	request.Segments = validSegments
	outputs := make([]string, len(validSegments))
	filter = cropFilter(request)
	totalDuration := 0.0
	for _, segment := range validSegments {
		totalDuration += segment.End - segment.Start
	}
	encoder := "libx264"
	if filter != "" || adjustAudio {
		encoder = detectEncoder(ffmpeg)
	}
	concurrency := 1
	if filter == "" {
		concurrency = runtime.NumCPU() / 2
		if concurrency < 1 {
			concurrency = 1
		}
		if concurrency > 4 {
			concurrency = 4
		}
	} else if runtime.NumCPU() >= 4 {
		concurrency = 2
	}
	threads := runtime.NumCPU() / concurrency
	progress := make([]float64, len(validSegments))
	var progressMu sync.Mutex
	var nextIndex int32
	var firstError error
	var errorMu sync.Mutex
	var workers sync.WaitGroup
	for worker := 0; worker < concurrency; worker++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for {
				index := int(atomic.AddInt32(&nextIndex, 1) - 1)
				if index >= len(validSegments) {
					return
				}
				segment := validSegments[index]
				output := request.OutputPath
				if len(validSegments) > 1 {
					ext := filepath.Ext(output)
					output = strings.TrimSuffix(output, ext) + fmt.Sprintf("-part-%02d%s", index+1, ext)
				}
				err := exportSegment(request, ffmpeg, encoder, index, segment, output, filter, adjustAudio, threads, progress, &progressMu, totalDuration)
				if err != nil && encoder != "libx264" {
					err = exportSegment(request, ffmpeg, "libx264", index, segment, output, filter, adjustAudio, threads, progress, &progressMu, totalDuration)
				}
				if err != nil {
					errorMu.Lock()
					if firstError == nil {
						firstError = err
					}
					errorMu.Unlock()
					return
				}
				outputs[index] = output
			}
		}()
	}
	workers.Wait()
	if firstError != nil {
		emit(map[string]any{"type": "error", "message": firstError.Error()})
		os.Exit(1)
	}
	if len(outputs) == 0 {
		emit(map[string]any{"type": "error", "message": "出力できるセグメントがありません。"})
		os.Exit(1)
	}
	emit(map[string]any{"type": "progress", "progress": 100, "message": "出力が完了しました。", "currentSegment": len(request.Segments), "totalSegments": len(request.Segments), "indeterminate": false})
	emit(map[string]any{"type": "result", "outputPath": outputs[0], "outputPaths": outputs})
}
