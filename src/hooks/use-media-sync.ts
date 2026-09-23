"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import { useMediaClock } from "./use-media-clock";

type TimedSegment = {
  startMs: number;
};

/**
 * Binary search: index of the last segment whose startMs has passed, or -1
 * if none has yet. Segments must already be in chronological order. Shared
 * by useMediaSync (transcript) and the player's own chapter highlighting,
 * so both use the identical "stays active through gaps" semantics.
 */
export function findActiveIndex<T extends TimedSegment>(segments: T[], timeMs: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].startMs <= timeMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Drives transcript/player sync off a single <audio>/<video> element.
 *
 * Design:
 * - While playing, polls currentTime via requestAnimationFrame (not
 *   `timeupdate`, which the spec only guarantees ~every 250ms and browsers
 *   often fire less often — too coarse to feel glued to the audio).
 * - React state only updates when the *active segment index* changes, not
 *   on every animation frame. currentTime itself lives in a ref inside
 *   useMediaClock. This is what keeps a transcript with hundreds/thousands
 *   of lines from re-rendering 60x/sec — most frames land inside the same
 *   utterance and cause zero re-renders.
 * - "Active" = the last segment whose startMs has passed, found by binary
 *   search (segments are already in chronological order). This intentionally
 *   keeps a line highlighted through silence/gaps until the next one starts,
 *   rather than flickering off between utterances.
 */
export function useMediaSync<T extends TimedSegment>(
  mediaRef: RefObject<HTMLMediaElement | null>,
  segments: T[],
) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);

  const handleTick = useCallback(
    (timeMs: number) => {
      const next = findActiveIndex(segments, timeMs);
      if (next !== activeIndexRef.current) {
        activeIndexRef.current = next;
        setActiveIndex(next);
      }
    },
    [segments],
  );

  const { isPlaying, seekTo } = useMediaClock(mediaRef, handleTick);

  return { activeIndex, isPlaying, seekTo };
}
