export const THEME_STORAGE_KEY = "theme";
export const THEME_EVENT = "themechange";

// Runs inline in <head> before first paint (see app/layout.tsx), so the page
// never flashes the wrong theme. An explicit choice wins; first-time visitors
// get their OS preference.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;
