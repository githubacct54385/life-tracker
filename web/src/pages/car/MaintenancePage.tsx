import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { averageMilesPerDay, type MaintenanceDocument, type MaintenanceRecord, type OdometerReadingRecord, type ServiceInterval, type ServicePlace } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Button } from "../../ui/Button";
import { Presence } from "../../ui/Presence";
import { todayLocal } from "../giving/giftFormat";
import { Page } from "../Page";
import { LogServicePanel } from "./LogServicePanel";
import { LastDoneSection, NO_FILTER, PlacesSection, type HistoryFilterState } from "./MaintenanceHistory";
import { MaintenanceList } from "./MaintenanceList";
import { ServiceDueSection } from "./ServiceDue";
import { Skeleton } from "../../ui/Skeleton";

// The chart loads only when this page opens, so Recharts stays out of the first screen (OPS-13).
const ServiceGapsChart = lazy(() => import("./ServiceGapsChart").then((m) => ({ default: m.ServiceGapsChart })));
import { RecentDocuments } from "./RecentDocuments";

/**
 * Car > Maintenance (MIL-05, MIL-06). The page opens on the history. "Log a service" opens the form as a panel, so the form
 * is out of the way when the owner only wants to look something up.
 */
export function MaintenancePage({ today = todayLocal() }: { today?: string } = {}) {
  const api = useApi();
  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null);
  const [places, setPlaces] = useState<ServicePlace[]>([]);
  const [documents, setDocuments] = useState<MaintenanceDocument[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<HistoryFilterState>(NO_FILTER);
  const [readings, setReadings] = useState<OdometerReadingRecord[]>([]);
  const [intervals, setIntervals] = useState<ServiceInterval[] | null>(null);
  const [intervalsFailed, setIntervalsFailed] = useState(false);
  // The readings come newest first.
  const latestOdometer = readings[0]?.miles;
  const milesPerDay = useMemo(() => averageMilesPerDay(readings, today), [readings, today]);
  const [logging, setLogging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, placeList] = await Promise.all([api.listMaintenance(), api.listServicePlaces()]);
      setRecords(list.records);
      setPlaces(placeList.places);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
    try {
      setIntervals((await api.listServiceIntervals()).intervals);
      setIntervalsFailed(false);
    } catch {
      setIntervalsFailed(true);
    }
    // Documents are an extra: if they cannot be loaded the services still show, just without their documents.
    try {
      setDocuments((await api.listDocuments()).documents);
    } catch {
      setDocuments([]);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    api
      .listAllReadings()
      .then((r) => setReadings(r.readings))
      .catch(() => undefined);
  }, [api, refresh]);

  const closePanel = useCallback(() => setLogging(false), []);

  return (
    <Page title="Maintenance">
      <div className="space-y-4 text-ink">
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => {
            setMessage(null);
            setLogging(true);
          }}
        >
          Log a service
        </Button>
        <Presence>{message ? <p role="status" className="text-gtext">{message}</p> : null}</Presence>
        <RecentDocuments documents={documents} records={records} />
        <ServiceDueSection records={records} intervals={intervals} odometer={latestOdometer} milesPerDay={milesPerDay} today={today} loadFailed={loadFailed || intervalsFailed} onChanged={refresh} onRetry={() => void refresh()} />
        {records && intervals && (
          <Suspense fallback={<Skeleton lines={3} />}>
            <ServiceGapsChart records={records} intervals={intervals} />
          </Suspense>
        )}
        <LastDoneSection records={records} loadFailed={loadFailed} onRetry={() => void refresh()} latestOdometer={latestOdometer} />
        <MaintenanceList records={records} places={places} documents={documents} today={today} loadFailed={loadFailed} filter={filter} onFilter={setFilter} onChanged={refresh} onRetry={() => void refresh()} />
        <PlacesSection places={places} records={records ?? []} onChanged={refresh} />
      </div>
      {logging && (
        <LogServicePanel
          places={places}
          today={today}
          latestOdometer={latestOdometer}
          onClose={closePanel}
          onSaved={async (text) => {
            setLogging(false);
            setMessage(text);
            await refresh();
          }}
        />
      )}
    </Page>
  );
}
