"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Low-level: wires play/pause/seeked/rAF against a media element and calls
 * `onTick(currentTimeMs)` every animation frame while playing (plus once on
 * pause/seeked, so consumers stay correct even when not playing). Doesn't
 * know about transcripts, chapters, or anything else — just the clock.
 *
 * Split out from useMediaSync so multiple consumers (transcript highlight,
 * player progress bar, chapter highlight) can each drive their own cheap
 * derived state off the same media element without re-implementing this
 * event wiring, while still avoiding a shared high-frequency React state
 * that would re-render everything on every frame.
 */
export function useMediaClock(
  mediaRef: RefObject<HTMLMediaElement | null>,
  onTick?: (timeMs: number) => void,
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  });

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const emit = () => {
      onTickRef.current?.(media.currentTime * 1000);
    };

    const tick = () => {
      emit();
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
      emit();
    };

    media.addEventListener("play", handlePlay);
    media.addEventListener("pause", stopLoop);
    media.addEventListener("ended", stopLoop);
    media.addEventListener("seeked", emit);

    return () => {
      media.removeEventListener("play", handlePlay);
      media.removeEventListener("pause", stopLoop);
      media.removeEventListener("ended", stopLoop);
      media.removeEventListener("seeked", emit);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [mediaRef]);

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

  return { isPlaying, seekTo };
}
