import React, { useState, useEffect, useRef } from "react";

interface HelpLabelProps {
  content: React.ReactNode;
  /** Optional: smaller style for compact headers (e.g. h4) */
  size?: "sm" | "md";
}

/**
 * A "?" help button that shows a popover with usage instructions on click.
 * Place in the top-right of a section header.
 */
export function HelpLabel({ content, size = "md" }: HelpLabelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const btnCls =
    size === "sm"
      ? "w-5 h-5 text-[0.7rem]"
      : "w-6 h-6 text-xs";
  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        className={`${btnCls} flex items-center justify-center rounded-full border border-border-input bg-surface/60 text-muted hover:text-text hover:bg-surface hover:border-border transition-colors cursor-help`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Help"
        aria-expanded={open}
      >
        ?
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-72 max-w-[calc(100vw-2rem)] p-3 rounded-md border border-border bg-surface shadow-lg text-sm text-text leading-relaxed"
          role="dialog"
          aria-label="Help"
        >
          {content}
        </div>
      )}
    </div>
  );
}
