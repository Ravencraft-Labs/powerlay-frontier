/**
 * Shared style constants for overlay frames.
 * Centralizes container and header classes to avoid duplication across overlay components.
 */
export const OVERLAY_FRAME_CLASSES = {
  container:
    "overlay-drag rounded-[10px] border border-border/90 px-4 py-3 backdrop-blur-md",
  /** Default width range; frames with wider rows (the build overlay) pass their own. */
  width: "min-w-[280px] max-w-[320px]",
  header: "overlay-drag text-[0.85rem] font-semibold mb-2 pb-1.5 border-b border-border/90 text-text",
} as const;
