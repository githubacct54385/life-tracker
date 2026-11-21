import { useEffect, useMemo, useState } from "react";
import { APP_NAME } from "@life-tracker/shared";
import { ApiProvider } from "../api/ApiContext";
import { GroceriesPage } from "../pages/groceries/GroceriesPage";
import { ImportMileagePage } from "../pages/car/ImportMileagePage";
import { createDemoApi } from "./demoApi";
import { sampleMileageFile } from "./sampleMileage";

export const DEMO_PATH = "/demo";

export function isDemoPath(pathname: string): boolean {
  return pathname === DEMO_PATH || pathname.startsWith(`${DEMO_PATH}/`);
}

/**
 * Demo mode (DEM-01). Screens here run against `demoApi`, never the network. The mileage import walkthrough (DEM-02) uses a
 * sample file generated in code, and the same screen and reader as the real import.
 */
export function DemoApp() {
  const [status, setStatus] = useState<string>("checking");
  const api = useMemo(() => createDemoApi(), []);
  useEffect(() => {
    void api
      .health()
      .then((r) => setStatus(r.status));
  }, [api]);

  return (
    <>
      <div role="status" style={{ background: "#2F6B4F", color: "#fff", padding: "8px 16px", textAlign: "center", fontWeight: 600 }}>
        Demo, fake data
      </div>
      <main style={{ padding: 16 }}>
        <h1>{APP_NAME}</h1>
        <p>This is a demo with made-up data. Nothing you do here is saved or sent anywhere. Demo data status: {status}.</p>
        <section aria-labelledby="demo-import" style={{ marginTop: 24 }}>
          <h2 id="demo-import" style={{ fontWeight: 700 }}>
            Try the mileage import
          </h2>
          <p>Use the sample file to see how importing a mileage spreadsheet works: upload, preview, then done. The sample is made up and is built right here in your browser.</p>
          <ApiProvider api={api}>
            <ImportMileagePage sample={sampleMileageFile} titleLevel={2} />
          </ApiProvider>
        </section>
        <section aria-labelledby="demo-groceries" style={{ marginTop: 24 }}>
          <h2 id="demo-groceries" style={{ fontWeight: 700 }}>
            Try the grocery list
          </h2>
          <p>Add items, tick them off as you find them, move one to another section, and finish the trip. The list is made up and lives only on this page.</p>
          <ApiProvider api={api}>
            <GroceriesPage titleLevel={2} />
          </ApiProvider>
        </section>
      </main>
    </>
  );
}
