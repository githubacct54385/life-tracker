import { useEffect, useState } from "react";
import { APP_NAME } from "@life-tracker/shared";
import { createDemoApi } from "./demoApi";

export const DEMO_PATH = "/demo";

export function isDemoPath(pathname: string): boolean {
  return pathname === DEMO_PATH || pathname.startsWith(`${DEMO_PATH}/`);
}

/** Skeleton of demo mode (DEM-01). Later stories add their screens here, running against `demoApi`. */
export function DemoApp() {
  const [status, setStatus] = useState<string>("checking");
  useEffect(() => {
    void createDemoApi()
      .health()
      .then((r) => setStatus(r.status));
  }, []);

  return (
    <>
      <div role="status" style={{ background: "#2F6B4F", color: "#fff", padding: "8px 16px", textAlign: "center", fontWeight: 600 }}>
        Demo, fake data
      </div>
      <main style={{ padding: 16 }}>
        <h1>{APP_NAME}</h1>
        <p>This is a demo with made-up data. Nothing you do here is saved or sent anywhere. Demo data status: {status}.</p>
      </main>
    </>
  );
}
