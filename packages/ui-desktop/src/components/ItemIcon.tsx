import React, { useState, useEffect } from "react";

let iconsBaseUrlPromise: Promise<string> | null = null;

function getIconsBaseUrlOnce(): Promise<string> {
  if (iconsBaseUrlPromise == null) {
    iconsBaseUrlPromise =
      typeof window !== "undefined" && window.efOverlay?.getIconsBaseUrl
        ? window.efOverlay.getIconsBaseUrl()
        : Promise.resolve("/icons/");
  }
  return iconsBaseUrlPromise;
}

export function useIconsBaseUrl(): string {
  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => {
    getIconsBaseUrlOnce().then(setBaseUrl);
  }, []);
  return baseUrl;
}

export interface ItemIconProps {
  typeID: number;
  size?: number;
  className?: string;
  /** Shown when icon fails to load. If omitted, renders a default placeholder (×). */
  fallback?: React.ReactNode;
}

/** Inline placeholder rendered when a typeID has no icon on disk. */
function MissingIconPlaceholder({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="no icon"
      className={`inline-block flex-shrink-0 align-middle text-muted ${className}`}
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.35"
      />
      <path
        d="M7 7 L17 17 M17 7 L7 17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

/** Renders a small icon for a typeID. On error, shows fallback if provided, else a × placeholder. */
export function ItemIcon({ typeID, size = 20, className = "", fallback }: ItemIconProps) {
  const baseUrl = useIconsBaseUrl();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [typeID]);

  // Wait for the base URL to resolve before deciding what to render — otherwise
  // we'd flash the placeholder before the real <img> ever gets a chance.
  if (!baseUrl) {
    return (
      <span
        aria-hidden
        className={`inline-block flex-shrink-0 align-middle ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (failed) {
    if (fallback != null) {
      return (
        <span
          className={`inline-flex items-center justify-center flex-shrink-0 align-middle text-muted text-xs overflow-hidden ${className}`}
          style={{
            width: size,
            height: size,
            minWidth: size,
            minHeight: size,
            maxWidth: Math.max(size * 4, 64),
          }}
          title={typeof fallback === "string" ? fallback : undefined}
        >
          <span className="truncate block w-full text-center px-0.5">{fallback}</span>
        </span>
      );
    }
    return <MissingIconPlaceholder size={size} className={className} />;
  }

  const src = `${baseUrl.replace(/\/?$/, "/")}${typeID}.png`;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`inline-block flex-shrink-0 align-middle ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
