import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MiniMapView } from "./components/map/MiniMapView";
import { PluginsProvider } from "./plugins/PluginsProvider";
import "./index.css";

/** POC: the same renderer serves the mini-map overlay window (transparent, frameless). */
const isMiniMap = new URLSearchParams(window.location.search).get("view") === "minimap";
if (isMiniMap) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  document.body.style.overflow = "hidden";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PluginsProvider>{isMiniMap ? <MiniMapView /> : <App />}</PluginsProvider>
  </React.StrictMode>
);
