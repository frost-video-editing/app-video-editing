package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"testing"
)

func TestVideoEncodingProfiles(t *testing.T) {
	tests := []struct {
		encoder string
		profile string
		want    []string
	}{
		{"libx264", "standard", []string{"-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "2"}},
		{"libx264", "high", []string{"-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-threads", "2"}},
		{"h264_nvenc", "high", []string{"-c:v", "h264_nvenc", "-preset", "p6", "-tune", "hq", "-rc", "vbr", "-cq", "15", "-b:v", "0"}},
		{"h264_qsv", "high", []string{"-c:v", "h264_qsv", "-preset", "medium", "-global_quality", "15"}},
		{"h264_amf", "high", []string{"-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "15", "-qp_p", "15"}},
		{"h264_nvenc", "standard", []string{"-c:v", "h264_nvenc", "-preset", "p4", "-tune", "hq", "-rc", "vbr", "-cq", "19", "-b:v", "0"}},
		{"h264_qsv", "standard", []string{"-c:v", "h264_qsv", "-preset", "medium", "-global_quality", "19"}},
		{"h264_amf", "standard", []string{"-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "19", "-qp_p", "19"}},
	}
	for _, tt := range tests {
		t.Run(tt.encoder+"/"+tt.profile, func(t *testing.T) {
			if got := videoEncodingArgs(tt.encoder, tt.profile, 2); !slices.Equal(got, tt.want) {
				t.Fatalf("encoding arguments = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestHighQualityEncodingSSIM(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("FFmpeg is required for the synthetic quality comparison")
	}
	directory := t.TempDir()
	source := filepath.Join(directory, "source.mkv")
	run := func(args ...string) string {
		t.Helper()
		output, err := exec.Command(ffmpeg, args...).CombinedOutput()
		if err != nil {
			t.Fatalf("FFmpeg failed: %v\n%s", err, output)
		}
		return string(output)
	}
	run("-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x96:rate=15:duration=2", "-c:v", "ffv1", "-y", source)
	ssimPattern := regexp.MustCompile(`All:([0-9.]+)`)
	measure := func(name string, args []string) float64 {
		t.Helper()
		output := filepath.Join(directory, name+".mp4")
		encodeArgs := append([]string{"-hide_banner", "-loglevel", "error", "-i", source}, args...)
		run(append(encodeArgs, "-y", output)...)
		report := run("-hide_banner", "-i", output, "-i", source, "-lavfi", "ssim", "-f", "null", "-")
		match := ssimPattern.FindStringSubmatch(report)
		if len(match) != 2 {
			t.Fatalf("FFmpeg did not report an SSIM score: %s", report)
		}
		value, err := strconv.ParseFloat(match[1], 64)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	previous := []string{"-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-threads", "1"}
	oldSSIM := measure("previous", previous)
	newSSIM := measure("high", videoEncodingArgs("libx264", "high", 1))
	t.Log(fmt.Sprintf("synthetic SSIM: previous %.6f; high %.6f", oldSSIM, newSSIM))
	if newSSIM < oldSSIM {
		t.Fatalf("high quality SSIM %.6f is lower than previous %.6f", newSSIM, oldSSIM)
	}
}
