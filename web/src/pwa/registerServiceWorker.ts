/** Registers the service worker (FND-05). Production builds only: in `vite dev` a worker would hide code changes. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app works without it; there is just no offline shell. Nothing private to log.
    });
  });
}
