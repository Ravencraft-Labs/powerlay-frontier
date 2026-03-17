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

function useIconsBaseUrl(): string {
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
  /** Shown when icon fails to load. If omitted, renders nothing on failure. */
  fallback?: React.ReactNode;
}

/** Renders a small icon for a typeID. On error, shows fallback if provided, else nothing. */
export function ItemIcon({ typeID, size = 20, className = "", fallback }: ItemIconProps) {
  const baseUrl = useIconsBaseUrl();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [typeID]);

  if (!baseUrl || failed) {
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
    return null;
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
