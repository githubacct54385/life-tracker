/** Shown instead of page content while offline (AC-FND-05.3). No data is kept on the device, so there is none to show. */
export function OfflineNotice() {
  return (
    <section role="alert" aria-labelledby="offline-title" className="mx-auto max-w-3xl">
      <h1 id="offline-title" className="text-2xl font-bold">You're offline</h1>
      <p className="mt-4 text-muted">
        Life Tracker needs a connection to show your data. For your privacy nothing is stored on this device. It will
        come back on its own when you are online again.
      </p>
    </section>
  );
}
