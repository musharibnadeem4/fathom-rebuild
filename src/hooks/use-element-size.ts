"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Tracks an element's live size (and its CSS `top` offset, useful for sticky
 * elements) via ResizeObserver, so layout math depending on it — e.g. a
 * scroll-margin that must clear a pinned header — stays correct as the
 * element's content changes, instead of hardcoding today's measurement.
 */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { height: number; top: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ height: 0, top: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const top = parseFloat(getComputedStyle(el).top) || 0;
      setSize((prev) => {
        const height = el.getBoundingClientRect().height;
        if (prev.height === height && prev.top === top) return prev;
        return { height, top };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
