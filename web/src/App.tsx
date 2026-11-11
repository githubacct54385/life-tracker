import { APP_NAME } from "@life-tracker/shared";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./nav/AppShell";
import { useNavKind } from "./nav/useNavKind";
import { MorePage } from "./pages/MorePage";
import { CarPage } from "./pages/car/CarPage";
import { LogOdometerPage } from "./pages/car/LogOdometerPage";
import { MileageStatsPage } from "./pages/car/MileageStatsPage";
import { Page } from "./pages/Page";
import { SettingsPage } from "./settings/SettingsPage";

// More exists only where Settings is hidden inside it (phone and tablet). On desktop Settings is in the sidebar.
function More() {
  return useNavKind() === "sidebar" ? <Navigate to="/settings" replace /> : <MorePage />;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Page title={APP_NAME} />} />
        <Route path="giving" element={<Page title="Giving" />} />
        <Route path="health" element={<Page title="Health" />} />
        <Route path="car" element={<CarPage />} />
        <Route path="car/log" element={<LogOdometerPage />} />
        <Route path="car/stats" element={<MileageStatsPage />} />
        <Route path="more" element={<More />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
