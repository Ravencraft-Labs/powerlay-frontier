import React, { useEffect, useState } from "react";

let iconsBaseUrlPromise: Promise<string> | null = null;

function getIconsBaseUrlOnce(): Promise<string> {
  if (iconsBaseUrlPromise == null) {
    const api = (window as unknown as { efOverlay?: { getIconsBaseUrl?: () => Promise<string> } }).efOverlay;
    iconsBaseUrlPromise = api?.getIconsBaseUrl ? api.getIconsBaseUrl() : Promise.resolve("/icons/");
  }
  return iconsBaseUrlPromise;
}

/** Small item icon by typeID; keeps its space while loading and leaves it blank if there is no icon. */
export function ItemIcon({ typeID, size = 14 }: { typeID: number; size?: number }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getIconsBaseUrlOnce().then(setBaseUrl);
  }, []);
  useEffect(() => setFailed(false), [typeID]);

  if (!baseUrl || failed) {
    return <span aria-hidden className="inline-block shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <img
      src={`${baseUrl.replace(/\/?$/, "/")}${typeID}.png`}
      alt=""
      width={size}
      height={size}
      className="inline-block shrink-0"
      onError={() => setFailed(true)}
    />
  );
}
