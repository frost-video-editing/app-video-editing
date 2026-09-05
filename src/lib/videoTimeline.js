export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function segmentDuration(segment) {
  return Math.max(0, Number(segment.end) - Number(segment.start));
}

export function timelineDuration(segments) {
  return segments.reduce((total, segment) => total + segmentDuration(segment), 0);
}

export function timelineSegmentAtTime(segments, time) {
  const t = Math.max(0, Number(time) || 0);
  let cursor = 0;
  for (const segment of Array.isArray(segments) ? segments : []) {
    const end = cursor + segmentDuration(segment);
    if (t >= cursor && t < end) {
      return segment;
    }
    cursor = end;
  }
  return null;
}

// Map a time measured in composed timeline seconds to the corresponding
// source video time. If `time` is beyond the composed duration, returns
// the end time of the last segment. If there are no segments, returns 0.
export function timelineToSourceTime(segments, time) {
  const t = Math.max(0, Number(time) || 0);
  if (!Array.isArray(segments) || !segments.length) return 0;
  let cursor = 0;
  for (const segment of segments) {
    const dur = segmentDuration(segment);
    if (t >= cursor && t <= cursor + dur) {
      const within = Math.min(dur, Math.max(0, t - cursor));
      return Number(segment.start || 0) + within;
    }
    cursor += dur;
  }
  const last = segments[segments.length - 1];
  return Number(last.end || last.start || 0);
}

// Map a source video time to the first matching composed timeline time.
// If the source time does not fall inside any segment, returns null.
export function sourceToTimelineTime(segments, sourceTime, preferredTimelineTime = null) {
  const s = Number(sourceTime);
  if (!Number.isFinite(s)) return null;
  const matches = [];
  let cursor = 0;
  for (const segment of segments) {
    const segStart = Number(segment.start || 0);
    const segEnd = Number(segment.end || 0);
    const dur = Math.max(0, segEnd - segStart);
    if (s >= segStart && s <= segEnd) {
      matches.push(cursor + Math.min(dur, Math.max(0, s - segStart)));
    }
    cursor += dur;
  }
  if (!matches.length) return null;
  if (!Number.isFinite(preferredTimelineTime)) return matches[0];
  return matches.reduce((closest, candidate) => (
    Math.abs(candidate - preferredTimelineTime) < Math.abs(closest - preferredTimelineTime) ? candidate : closest
  ), matches[0]);
}

export function formatSeconds(value) {
  const total = Math.max(0, Number(value) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const fraction = Math.round((total - Math.floor(total)) * 1000);
  const prefix = hours > 0 ? `${String(hours).padStart(2, "0")}:` : "";
  return `${prefix}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
}

// Formats a duration as the editor's fixed minute-second-millisecond display.
export function formatVideoTime(totalSeconds) {
  const total = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const fraction = Math.round((total - Math.floor(total)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
}

export function normalizeRange(start, end, max) {
  const safeStart = clamp(Number(start) || 0, 0, max);
  const safeEnd = clamp(Number(end) || 0, 0, max);
  return safeStart <= safeEnd ? { start: safeStart, end: safeEnd } : { start: safeEnd, end: safeStart };
}

export function createFullTimeline(duration) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  return safeDuration > 0 ? [{ start: 0, end: safeDuration }] : [];
}

function pushSegment(list, segment) {
  if (segmentDuration(segment) > 0) {
    list.push({ ...segment, start: segment.start, end: segment.end });
  }
}

export function extractRange(segments, start, end) {
  const range = normalizeRange(start, end, timelineDuration(segments));
  if (range.start === range.end) {
    return [];
  }

  const extracted = [];
  let cursor = 0;

  for (const segment of segments) {
    const duration = segmentDuration(segment);
    const segmentStart = cursor;
    const segmentEnd = cursor + duration;

    if (segmentEnd <= range.start || segmentStart >= range.end) {
      cursor = segmentEnd;
      continue;
    }

    const overlapStart = Math.max(range.start, segmentStart);
    const overlapEnd = Math.min(range.end, segmentEnd);
    const sourceStart = segment.start + (overlapStart - segmentStart);
    const sourceEnd = segment.start + (overlapEnd - segmentStart);
    pushSegment(extracted, { start: sourceStart, end: sourceEnd });
    cursor = segmentEnd;
  }

  return extracted;
}

export function removeRange(segments, start, end) {
  const range = normalizeRange(start, end, timelineDuration(segments));
  if (range.start === range.end) {
    return segments.map((segment) => ({ ...segment }));
  }

  const nextSegments = [];
  let cursor = 0;

  for (const segment of segments) {
    const duration = segmentDuration(segment);
    const segmentStart = cursor;
    const segmentEnd = cursor + duration;

    if (segmentEnd <= range.start || segmentStart >= range.end) {
      pushSegment(nextSegments, segment);
      cursor = segmentEnd;
      continue;
    }

    const overlapStart = Math.max(range.start, segmentStart);
    const overlapEnd = Math.min(range.end, segmentEnd);

    if (overlapStart > segmentStart) {
      const beforeEnd = segment.start + (overlapStart - segmentStart);
      pushSegment(nextSegments, { start: segment.start, end: beforeEnd });
    }

    if (overlapEnd < segmentEnd) {
      const afterStart = segment.start + (overlapEnd - segmentStart);
      pushSegment(nextSegments, { start: afterStart, end: segment.end });
    }

    cursor = segmentEnd;
  }

  return nextSegments;
}

export function insertSegmentsAt(segments, insertAt, clipboardSegments) {
  if (!clipboardSegments.length) {
    return segments.map((segment) => ({ ...segment }));
  }

  const totalDuration = timelineDuration(segments);
  const position = clamp(Number(insertAt) || 0, 0, totalDuration);
  const nextSegments = [];
  let cursor = 0;
  let inserted = false;

  for (const segment of segments) {
    const duration = segmentDuration(segment);
    const segmentStart = cursor;
    const segmentEnd = cursor + duration;

    if (!inserted && position <= segmentStart) {
      clipboardSegments.forEach((item) => pushSegment(nextSegments, item));
      inserted = true;
    }

    if (!inserted && position > segmentStart && position < segmentEnd) {
      const offset = position - segmentStart;
      if (offset > 0) {
        pushSegment(nextSegments, { start: segment.start, end: segment.start + offset });
      }
      clipboardSegments.forEach((item) => pushSegment(nextSegments, item));
      if (offset < duration) {
        pushSegment(nextSegments, { start: segment.start + offset, end: segment.end });
      }
      inserted = true;
      cursor = segmentEnd;
      continue;
    }

    if (!inserted && position === segmentEnd) {
      pushSegment(nextSegments, segment);
      clipboardSegments.forEach((item) => pushSegment(nextSegments, item));
      inserted = true;
      cursor = segmentEnd;
      continue;
    }

    pushSegment(nextSegments, segment);
    cursor = segmentEnd;
  }

  if (!inserted) {
    clipboardSegments.forEach((item) => pushSegment(nextSegments, item));
  }

  return nextSegments;
}

// Splits the segment containing sourceTime, preferring the segment at the given timeline position.
export function splitSegmentsAtPreviewTime(segments, sourceTime, preferredTimelineTime) {
  const targetTime = Math.max(0, Number(sourceTime) || 0);
  const preferredTime = Math.max(0, Number(preferredTimelineTime) || 0);
  let cursor = 0;
  let preferredIndex = -1;

  for (let index = 0; index < segments.length; index += 1) {
    const duration = segmentDuration(segments[index]);
    if (preferredTime >= cursor && preferredTime <= cursor + duration) {
      preferredIndex = index;
      break;
    }
    cursor += duration;
  }

  const candidateIndexes = preferredIndex >= 0
    ? [preferredIndex, ...segments.map((_, index) => index).filter((index) => index !== preferredIndex)]
    : segments.map((_, index) => index);

  let timelineCursor = 0;
  const timelineStarts = segments.map((segment) => {
    const start = timelineCursor;
    timelineCursor += segmentDuration(segment);
    return start;
  });

  for (const index of candidateIndexes) {
    const segment = segments[index];
    const splitOffset = targetTime - Number(segment.start || 0);
    const duration = segmentDuration(segment);
    if (!(splitOffset > 0 && splitOffset < duration)) {
      continue;
    }

    const splitPoint = Number(segment.start) + splitOffset;
    const nextSegments = segments.flatMap((item, itemIndex) => (
      itemIndex === index
        ? [
          { ...item, start: item.start, end: splitPoint },
          { ...item, start: splitPoint, end: item.end }
        ]
        : [{ ...item }]
    ));

    return { nextSegments, timelineSplitTime: timelineStarts[index] + splitOffset };
  }

  return null;
}

// Splits every segment at valid positions measured in composed timeline seconds.
export function splitSegmentsAtTimelinePositions(segments, splitTimes) {
  const total = timelineDuration(segments);
  const times = Array.from(new Set((splitTimes || []).map((time) => Number(time) || 0)))
    .sort((first, second) => first - second)
    .filter((time) => time > 0 && time < total);
  if (!times.length) {
    return null;
  }

  let timelineCursor = 0;
  const nextSegments = [];

  for (const segment of segments) {
    const duration = segmentDuration(segment);
    const start = timelineCursor;
    const end = timelineCursor + duration;
    const splits = times
      .filter((time) => time > start && time < end)
      .map((time) => segment.start + (time - start));

    if (!splits.length) {
      nextSegments.push({ ...segment });
    } else {
      const boundaries = [segment.start, ...splits, segment.end];
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        if (boundaries[index + 1] - boundaries[index] > 1e-9) {
          nextSegments.push({
            ...segment,
            start: boundaries[index],
            end: boundaries[index + 1]
          });
        }
      }
    }
    timelineCursor = end;
  }

  return nextSegments;
}
