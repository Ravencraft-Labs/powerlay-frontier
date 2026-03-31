import React, { createContext, useContext } from "react";

export interface OverlayLockContextValue {
  locked: boolean;
}

const OverlayLockContext = createContext<OverlayLockContextValue>({ locked: false });

export function OverlayLockProvider({
  locked,
  children,
}: {
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <OverlayLockContext.Provider value={{ locked }}>
      {children}
    </OverlayLockContext.Provider>
  );
}

export function useOverlayLock(): OverlayLockContextValue {
  return useContext(OverlayLockContext);
}
