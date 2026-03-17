import React, { useState } from "react";

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

interface LogLocateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocated?: () => void;
}

export function LogLocateModal({ isOpen, onClose, onLocated }: LogLocateModalProps) {
  const [dismissed, setDismissed] = useState(false);

  const handleBrowse = async () => {
    const picked = await window.efOverlay?.app?.pickLogDir();
    if (picked) {
      await window.efOverlay?.settings?.set({ gameLogDir: picked });
      onLocated?.();
      onClose();
    }
  };

  const handleDontShow = async () => {
    await window.efOverlay?.app?.setSkipLogPrompt?.();
    setDismissed(true);
  };

  const handleClose = () => {
    setDismissed(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div
        className="bg-bg border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-semibold text-text">Locate game log folder</h2>
          <button
            type="button"
            className="p-1 rounded text-muted hover:text-text hover:bg-border"
            onClick={handleClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {!dismissed ? (
          <>
            <p className="text-sm text-text m-0">
              To track mining from logs, select the folder where EVE Frontier writes its logs (e.g.{" "}
              <code className="px-1 py-0.5 rounded bg-surface text-xs">Documents\Frontier\Logs\Gamelogs</code>).
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface"
                onClick={handleBrowse}
              >
                Browse
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface text-muted"
                onClick={handleDontShow}
              >
                Don&apos;t show again
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-amber-600 dark:text-amber-500 m-0">
              You can change this later in Settings (gear icon in the header).
            </p>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface self-start"
              onClick={handleClose}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
