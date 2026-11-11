import { APP_NAME } from "@life-tracker/shared";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./nav/AppShell";
import { useNavKind } from "./nav/useNavKind";
import { MorePage } from "./pages/MorePage";
import { Page } from "./pages/Page";

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
        <Route path="car" element={<Page title="Car" />} />
        <Route path="more" element={<More />} />
        <Route path="settings" element={<Page title="Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
