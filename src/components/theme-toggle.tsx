"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_EVENT, THEME_STORAGE_KEY } from "@/lib/theme";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

const isDarkNow = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  // Server snapshot is "light"; after hydration the real class is read, so the
  // icon may swap once. Sun and moon are the same size, so nothing moves.
  const dark = useSyncExternalStore(subscribe, isDarkNow, () => false);

  const toggle = () => {
    const next = !isDarkNow();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // storage unavailable (private mode etc.) — theme still applies for this visit
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      type="button"
      data-theme-toggle
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      // size-7 matches the logo mark, the header's tallest item, so adding the
      // toggle doesn't change the header's height.
      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
