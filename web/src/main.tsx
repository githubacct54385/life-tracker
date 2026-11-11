import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { DemoApp, isDemoPath } from "./demo/DemoApp";
import { registerServiceWorker } from "./pwa/registerServiceWorker";
import { applyTheme, loadPreferences } from "./settings/preferences";
import "./index.css";

applyTheme(loadPreferences().theme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isDemoPath(window.location.pathname) ? (
      <DemoApp />
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </StrictMode>,
);

registerServiceWorker();
