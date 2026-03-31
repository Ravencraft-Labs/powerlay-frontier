import React from "react";

export interface DemoModalProps {
  title: string;
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional footer (e.g. extra buttons). Close is always available. */
  footer?: React.ReactNode;
  closeLabel?: string;
  panelClassName?: string;
}

const defaultCloseCls =
  "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface";

export function DemoModal({
  title,
  titleId,
  onClose,
  children,
  footer,
  closeLabel = "Close",
  panelClassName = "max-w-md w-full",
}: DemoModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={`bg-surface border border-border rounded-lg p-4 shadow-xl ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="m-0 text-sm font-semibold text-text mb-3">
          {title}
        </h3>
        {children}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {footer}
          <button type="button" className={defaultCloseCls} onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
