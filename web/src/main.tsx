import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DemoApp, isDemoPath } from "./demo/DemoApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isDemoPath(window.location.pathname) ? <DemoApp /> : <App />}</StrictMode>,
);
