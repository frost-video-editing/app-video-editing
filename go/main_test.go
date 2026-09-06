package main

import "testing"

func TestSegmentInputPathPrefersSegmentSource(t *testing.T) {
	request := Request{SourcePath: "primary.mp4"}
	segment := Segment{SourcePath: "secondary.mp4"}

	if got := segmentInputPath(request, segment); got != "secondary.mp4" {
		t.Fatalf("segment input path = %q, want %q", got, "secondary.mp4")
	}
}

func TestSegmentInputPathFallsBackToRequestSource(t *testing.T) {
	request := Request{SourcePath: "primary.mp4"}
	segment := Segment{}

	if got := segmentInputPath(request, segment); got != "primary.mp4" {
		t.Fatalf("segment input path = %q, want %q", got, "primary.mp4")
	}
}

func TestSegmentInputArgsLoopsImagesAndUsesSegmentSource(t *testing.T) {
	args := segmentInputArgs(Request{SourcePath: "primary.mp4"}, Segment{
		Start:      0,
		End:        5,
		MediaType:  "image",
		SourcePath: "poster.png",
	})

	want := []string{"-loop", "1", "-t", "5.000", "-i", "poster.png"}
	if len(args) != len(want) {
		t.Fatalf("image input args = %#v, want %#v", args, want)
	}
	for index := range want {
		if args[index] != want[index] {
			t.Fatalf("image input args = %#v, want %#v", args, want)
		}
	}
}

func TestSegmentInputArgsSeeksVideoSegments(t *testing.T) {
	args := segmentInputArgs(Request{SourcePath: "primary.mp4"}, Segment{Start: 2.5, End: 4})

	want := []string{"-ss", "2.500", "-t", "1.500", "-i", "primary.mp4"}
	if len(args) != len(want) {
		t.Fatalf("video input args = %#v, want %#v", args, want)
	}
	for index := range want {
		if args[index] != want[index] {
			t.Fatalf("video input args = %#v, want %#v", args, want)
		}
	}
}
