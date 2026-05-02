export type Theme = {
  id: string;
  name: string;
  bg: string;       // outer + panel body background (shared)
  panel: string;    // inset panel background (slightly offset from bg)
  text: string;     // primary text
  muted: string;    // secondary text
  border: string;   // panel borders and row separators
  accent: string;   // primary accent: title underline, result outline, pill
  accent2: string;  // secondary accent: handwritten annotations, situation label
};

/**
 * Dark-only theme pool. Every theme ships both accents so the
 * two-color hierarchy (green + purple on Midnight etc.) survives
 * across shuffle.
 */
export const THEMES: Theme[] = [
  { id: "midnight",    name: "Midnight",    bg: "#0b1020", panel: "#111733", text: "#dfe3ee", muted: "#7f8aa1", border: "#1e2547", accent: "#4ade80", accent2: "#a78bfa" },
  { id: "terminal",    name: "Terminal",    bg: "#0a0a0a", panel: "#141414", text: "#e5e5e5", muted: "#8f8f8f", border: "#262626", accent: "#22c55e", accent2: "#eab308" },
  { id: "dracula",     name: "Dracula",     bg: "#14141f", panel: "#1c1c2e", text: "#f0eef5", muted: "#8b8ca0", border: "#2a2a3f", accent: "#50fa7b", accent2: "#ff79c6" },
  { id: "forest",      name: "Forest",      bg: "#0f2a1e", panel: "#163a2a", text: "#cfe8d6", muted: "#79a88d", border: "#1e4b35", accent: "#facc15", accent2: "#f472b6" },
  { id: "deep-sea",    name: "Deep Sea",    bg: "#0c1d3d", panel: "#132b54", text: "#d6e1f3", muted: "#7892b8", border: "#1e3a6b", accent: "#22d3ee", accent2: "#f472b6" },
  { id: "plum",        name: "Plum",        bg: "#170725", panel: "#220c36", text: "#ecdff5", muted: "#9c84b5", border: "#2e1147", accent: "#f472b6", accent2: "#facc15" },
  { id: "mono-dark",   name: "Mono Dark",   bg: "#09090b", panel: "#141416", text: "#e8e8ea", muted: "#8f8f98", border: "#27272a", accent: "#fbbf24", accent2: "#38bdf8" },
  { id: "graphite",    name: "Graphite",    bg: "#1a202b", panel: "#232a38", text: "#dee1e7", muted: "#8a94a3", border: "#2e3645", accent: "#fbbf24", accent2: "#60a5fa" },

  // --- additions ---
  { id: "oxblood",     name: "Oxblood",     bg: "#1a0708", panel: "#260b0e", text: "#f0d8d8", muted: "#a87878", border: "#361014", accent: "#f97316", accent2: "#5eead4" },
  { id: "cyberpunk",   name: "Cyberpunk",   bg: "#0a0014", panel: "#130522", text: "#e6d8f0", muted: "#9378b5", border: "#1e0a33", accent: "#d946ef", accent2: "#22d3ee" },
  { id: "espresso",    name: "Espresso",    bg: "#150b07", panel: "#20140d", text: "#ebdbc4", muted: "#a08066", border: "#2a1a10", accent: "#fbbf24", accent2: "#fb7185" },
  { id: "cobalt",      name: "Cobalt",      bg: "#061230", panel: "#0c1c4a", text: "#cfdbf4", muted: "#7184af", border: "#122354", accent: "#fbbf24", accent2: "#5eead4" },
  { id: "matrix",      name: "Matrix",      bg: "#050a08", panel: "#0b1510", text: "#e8f5ed", muted: "#6fa388", border: "#142620", accent: "#84ff99", accent2: "#fbbf24" },
  { id: "aubergine",   name: "Aubergine",   bg: "#1a0921", panel: "#271035", text: "#e6d0ec", muted: "#9272ab", border: "#361748", accent: "#f97316", accent2: "#5eead4" },
  { id: "slate-blue",  name: "Slate Blue",  bg: "#0f172a", panel: "#1a2a44", text: "#dbe2ed", muted: "#7d8ba5", border: "#22334d", accent: "#38bdf8", accent2: "#f472b6" },
  { id: "nightshade",  name: "Nightshade",  bg: "#0c0912", panel: "#1a1226", text: "#e3dbe9", muted: "#8d82a0", border: "#271a39", accent: "#ef4444", accent2: "#a78bfa" },
];

