import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./nav/AppShell";
import { useNavKind } from "./nav/useNavKind";
import { MorePage } from "./pages/MorePage";
import { GivingPage } from "./pages/giving/GivingPage";
import { LogGiftPage } from "./pages/giving/LogGiftPage";
import { SpecialContributionsPage } from "./pages/giving/SpecialContributionsPage";
import { CarPage } from "./pages/car/CarPage";
import { ImportMileagePage } from "./pages/car/ImportMileagePage";
import { LogOdometerPage } from "./pages/car/LogOdometerPage";
import { MileageStatsPage } from "./pages/car/MileageStatsPage";
import { HealthPage } from "./pages/health/HealthPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { LogWeightPage } from "./pages/health/LogWeightPage";
import { LogWorkoutPage } from "./pages/health/LogWorkoutPage";
import { MaintenancePage } from "./pages/car/MaintenancePage";
import { GroceriesPage } from "./pages/groceries/GroceriesPage";
import { SettingsPage } from "./settings/SettingsPage";

// More exists only where Settings is hidden inside it (phone and tablet). On desktop Settings is in the sidebar.
function More() {
  return useNavKind() === "sidebar" ? <Navigate to="/settings" replace /> : <MorePage />;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="giving" element={<GivingPage />} />
        <Route path="giving/log" element={<LogGiftPage />} />
        <Route path="giving/special" element={<SpecialContributionsPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="health/weight" element={<LogWeightPage />} />
        <Route path="health/workouts" element={<LogWorkoutPage />} />
        <Route path="car" element={<CarPage />} />
        <Route path="car/log" element={<LogOdometerPage />} />
        <Route path="car/maintenance" element={<MaintenancePage />} />
        <Route path="car/stats" element={<MileageStatsPage />} />
        <Route path="car/import" element={<ImportMileagePage />} />
        <Route path="groceries" element={<GroceriesPage />} />
        <Route path="more" element={<More />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
