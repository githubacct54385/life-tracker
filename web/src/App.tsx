import { lazy, Suspense } from "react";
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
import { HealthPage } from "./pages/health/HealthPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { LogWorkoutPage } from "./pages/health/LogWorkoutPage";
import { MaintenancePage } from "./pages/car/MaintenancePage";
import { GroceriesPage } from "./pages/groceries/GroceriesPage";
import { SettingsPage } from "./settings/SettingsPage";
import { Skeleton } from "./ui/Skeleton";

// The two pages that draw a chart load their code only when opened, so the chart library stays out of the first screen (OPS-13).
const LogWeightPage = lazy(() => import("./pages/health/LogWeightPage").then((m) => ({ default: m.LogWeightPage })));
const MileageStatsPage = lazy(() => import("./pages/car/MileageStatsPage").then((m) => ({ default: m.MileageStatsPage })));

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
        <Route path="health/weight" element={<Suspense fallback={<Skeleton lines={4} />}><LogWeightPage /></Suspense>} />
        <Route path="health/workouts" element={<LogWorkoutPage />} />
        <Route path="car" element={<CarPage />} />
        <Route path="car/log" element={<LogOdometerPage />} />
        <Route path="car/maintenance" element={<MaintenancePage />} />
        <Route path="car/stats" element={<Suspense fallback={<Skeleton lines={4} />}><MileageStatsPage /></Suspense>} />
        <Route path="car/import" element={<ImportMileagePage />} />
        <Route path="groceries" element={<GroceriesPage />} />
        <Route path="more" element={<More />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
