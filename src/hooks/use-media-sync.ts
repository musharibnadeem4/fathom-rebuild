"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type TimedSegment = {
  startMs: number;
};

/**
 * Drives transcript/player sync off a single <audio>/<video> element.
 *
 * Design:
 * - While playing, polls currentTime via requestAnimationFrame (not
 *   `timeupdate`, which the spec only guarantees ~every 250ms and browsers
 *   often fire less often — too coarse to feel glued to the audio).
 * - React state only updates when the *active segment index* changes, not
 *   on every animation frame. currentTime itself lives in a ref. This is
 *   what keeps a transcript with hundreds/thousands of lines from
 *   re-rendering 60x/sec — most frames land inside the same utterance and
 *   cause zero re-renders.
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
  const [isPlaying, setIsPlaying] = useState(false);
  const activeIndexRef = useRef(-1);
  const rafRef = useRef<number | null>(null);

  const computeActiveIndex = useCallback(
    (timeMs: number) => {
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
    },
    [segments],
  );

  const syncNow = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    const next = computeActiveIndex(media.currentTime * 1000);
    if (next !== activeIndexRef.current) {
      activeIndexRef.current = next;
      setActiveIndex(next);
    }
  }, [mediaRef, computeActiveIndex]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const tick = () => {
      syncNow();
      rafRef.current = requestAnimationFrame(tick);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      setIsPlaying(false);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      syncNow();
    };

    media.addEventListener("play", handlePlay);
    media.addEventListener("pause", stopLoop);
    media.addEventListener("ended", stopLoop);
    media.addEventListener("seeked", syncNow);

    return () => {
      media.removeEventListener("play", handlePlay);
      media.removeEventListener("pause", stopLoop);
      media.removeEventListener("ended", stopLoop);
      media.removeEventListener("seeked", syncNow);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [mediaRef, syncNow]);

  const seekTo = useCallback(
    (ms: number) => {
      const media = mediaRef.current;
      if (!media) return;
      const applySeek = () => {
        media.currentTime = ms / 1000;
        void media.play();
      };
      if (media.readyState >= 1) {
        applySeek();
      } else {
        media.addEventListener("loadedmetadata", applySeek, { once: true });
      }
    },
    [mediaRef],
  );

  return { activeIndex, isPlaying, seekTo };
}
