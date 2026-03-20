import React, { createContext, useContext } from "react";

const OverlayLockContext = createContext<boolean>(false);

export function OverlayLockProvider({
  locked,
  children,
}: {
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <OverlayLockContext.Provider value={locked}>
      {children}
    </OverlayLockContext.Provider>
  );
}

export function useOverlayLock(): boolean {
  return useContext(OverlayLockContext);
}
