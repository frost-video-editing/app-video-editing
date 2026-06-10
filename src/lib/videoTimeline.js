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
export function sourceToTimelineTime(segments, sourceTime) {
  const s = Number(sourceTime);
  if (!Number.isFinite(s)) return null;
  let cursor = 0;
  for (const segment of segments) {
    const segStart = Number(segment.start || 0);
    const segEnd = Number(segment.end || 0);
    const dur = Math.max(0, segEnd - segStart);
    if (s >= segStart && s <= segEnd) {
      return cursor + Math.min(dur, Math.max(0, s - segStart));
    }
    cursor += dur;
  }
  return null;
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
    list.push({ start: segment.start, end: segment.end });
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
