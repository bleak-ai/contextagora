const BASE = "relative mb-3 overflow-hidden rounded-md border border-border bg-bg-raised pl-3 pr-2.5 py-2 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]";

export const ZONE_WRAPPER_CLASS = {
  active: `${BASE} before:bg-accent`,
  connectors: `${BASE} before:bg-accent-secondary`,
} as const;
