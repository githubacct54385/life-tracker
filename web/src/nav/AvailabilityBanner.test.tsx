import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityResponse } from "@life-tracker/shared";
import { ApiProvider } from "../api/ApiContext";
import { getUnavailable, reportUnavailable, setUnavailable } from "../api/availabilityStatus";
import { createClient } from "../api/client";
import type { Api } from "../api/types";
import { createDemoApi } from "../demo/demoApi";
import { HealthPage } from "../pages/health/HealthPage";
import { FailureText } from "../ui/FailureText";
import { AppShell } from "./AppShell";
import { AvailabilityBanner, RECHECK_MS } from "./AvailabilityBanner";

// jsdom has no layout, so a fake matchMedia stands in for a phone-width browser.
beforeEach(() => {
  setUnavailable([]);
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  setUnavailable([]);
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

const ALL_OK: AvailabilityResponse = { database: "ok", documents: "ok", signIn: "ok" };
function apiWith(getAvailability: () => Promise<AvailabilityResponse>): Api {
  return { ...createDemoApi(), getAvailability };
}
function shell(api: Api) {
  return render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <AppShell />
      </ApiProvider>
    </MemoryRouter>,
  );
}
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("the unavailable banner", () => {
  it("[AC-OPS-14.3] shows nothing while everything is fine, and nothing in demo mode", () => {
    shell(createDemoApi());
    expect(screen.queryByText(/not available right now/)).toBeNull();
  });

  it("[AC-OPS-14.3] says which part is down in plain words, and that saved data is safe, as a live status for screen readers", () => {
    reportUnavailable("database");
    shell(createDemoApi());
    const banner = screen.getByText("The database is not available right now. Please try again in a few minutes. Your saved data is safe.");
    expect(banner.getAttribute("role")).toBe("status");
  });

  it("[AC-OPS-14.3] names every part that is down, in a fixed order", () => {
    setUnavailable(["signIn", "documents"]);
    shell(createDemoApi());
    expect(screen.getByRole("status").textContent).toBe("Documents are not available right now. The sign-in check is not available right now. Please try again in a few minutes. Your saved data is safe.");
  });

  it("[AC-OPS-14.3] checks again every 30 seconds while a part is down, keeps showing while it still is, and goes away by itself when it is back", async () => {
    vi.useFakeTimers();
    const checks: AvailabilityResponse[] = [{ database: "unavailable", documents: "ok", signIn: "ok" }, ALL_OK];
    const getAvailability = vi.fn(async () => checks.shift() ?? ALL_OK);
    setUnavailable(["database"]);
    shell(apiWith(getAvailability));
    expect(getAvailability).not.toHaveBeenCalled();

    await act(async () => void (await vi.advanceTimersByTimeAsync(RECHECK_MS)));
    expect(getAvailability).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toMatch(/database is not available/);

    await act(async () => void (await vi.advanceTimersByTimeAsync(RECHECK_MS)));
    expect(getAvailability).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
    expect(getUnavailable()).toEqual([]);

    // Once clear it stops asking.
    await act(async () => void (await vi.advanceTimersByTimeAsync(RECHECK_MS * 3)));
    expect(getAvailability).toHaveBeenCalledTimes(2);
  });

  it("[AC-OPS-14.3] when the check itself fails it keeps what it knew, and tries again later", async () => {
    vi.useFakeTimers();
    const getAvailability = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(ALL_OK);
    setUnavailable(["documents"]);
    shell(apiWith(getAvailability));
    await act(async () => void (await vi.advanceTimersByTimeAsync(RECHECK_MS)));
    expect(screen.getByRole("status").textContent).toMatch(/Documents are not available/);
    await act(async () => void (await vi.advanceTimersByTimeAsync(RECHECK_MS)));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("[AC-OPS-14.7] a phone with no network at all keeps the offline notice and shows no banner", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    setUnavailable(["database"]);
    shell(createDemoApi());
    expect(screen.queryByText(/not available right now/)).toBeNull();
  });

  it("[AC-OPS-14.3] stops checking when the banner is gone from the page", async () => {
    vi.useFakeTimers();
    const getAvailability = vi.fn(async () => ALL_OK);
    setUnavailable(["database"]);
    const { unmount } = render(
      <ApiProvider api={apiWith(getAvailability)}>
        <AvailabilityBanner />
      </ApiProvider>,
    );
    unmount();
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 2);
    expect(getAvailability).not.toHaveBeenCalled();
  });
});

describe("the client reports a part that is down", () => {
  const down = (part: string) => async () => json({ error: "unavailable", part }, 503);

  it("[AC-OPS-14.3] a 503 that names a part puts it in the banner, for a read and for a write", async () => {
    const api = createClient(down("database"), { retryDelayMs: 0 });
    await expect(api.listGifts()).rejects.toThrow();
    expect(getUnavailable()).toEqual(["database"]);
    setUnavailable([]);
    await expect(api.logGift({ dateGiven: "2026-11-01", forMonth: "2026-10", cents: 100, method: "card" } as never)).rejects.toThrow();
    expect(getUnavailable()).toEqual(["database"]);
  });

  it("[AC-OPS-14.3] each of the three parts is reported by its own name", async () => {
    for (const part of ["database", "documents", "signIn"] as const) {
      setUnavailable([]);
      await createClient(down(part), { retryDelayMs: 0 }).listGifts().catch(() => undefined);
      expect(getUnavailable()).toEqual([part]);
    }
  });

  it("[AC-OPS-14.3] an ordinary 503 with no part (the database waking up), a body that is not JSON, and an unknown part are not reported", async () => {
    for (const respond of [async () => new Response(null, { status: 503 }), async () => new Response("<html>bad gateway</html>", { status: 503 }), down("cache")]) {
      await createClient(respond, { retryDelayMs: 0 }).listGifts().catch(() => undefined);
    }
    expect(getUnavailable()).toEqual([]);
  });

  it("[AC-OPS-14.3] a 500 or a 401 is not reported as a part being down", async () => {
    await createClient(async () => json({ error: "internal" }, 500), { retryDelayMs: 0 }).listGifts().catch(() => undefined);
    await createClient(async () => json({ error: "unauthorized" }, 401), { retryDelayMs: 0 }).listGifts().catch(() => undefined);
    expect(getUnavailable()).toEqual([]);
  });

  it("[AC-OPS-14.3] the check reads /api/health/parts and returns the shared shape", async () => {
    const urls: string[] = [];
    const api = createClient(async (input) => (urls.push(input), json(ALL_OK)), { retryDelayMs: 0 });
    expect(await api.getAvailability()).toEqual(ALL_OK);
    expect(urls).toEqual(["/api/health/parts"]);
  });

  it("[AC-OPS-14.3] the banner shows on every page once any request says a part is down", async () => {
    const api = createClient(down("database"), { retryDelayMs: 0 });
    shell(api);
    await act(async () => void (await api.listGifts().catch(() => undefined)));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/The database is not available right now/));
  });
});

describe("the message where the failed part would be", () => {
  it("[AC-OPS-14.4] says which part is down in plain words in place of the usual failure text, only for the parts the request needs", () => {
    setUnavailable(["database"]);
    render(<FailureText fallback="That did not work. Try again." />);
    expect(screen.getByText("The database is not available right now. Try again in a few minutes.")).toBeTruthy();
    cleanup();
    // Documents being down does not explain a failed gift: the usual text stays.
    setUnavailable(["documents"]);
    render(<FailureText fallback="That did not work. Try again." />);
    expect(screen.getByText("That did not work. Try again.")).toBeTruthy();
    cleanup();
    render(<FailureText fallback="Could not open the photo." needs={["documents"]} />);
    expect(screen.getByText("Documents are not available right now. Try again in a few minutes.")).toBeTruthy();
  });

  it("[AC-OPS-14.4] shows the usual text when nothing is known to be down", () => {
    render(<FailureText fallback="Could not load this." />);
    expect(screen.getByText("Could not load this.")).toBeTruthy();
  });

  it("[AC-OPS-14.5] never shows anything technical: only the fixed sentences", () => {
    setUnavailable(["database", "documents", "signIn"]);
    render(<FailureText fallback="x" needs={["database", "documents", "signIn"]} />);
    expect(document.body.textContent).not.toMatch(/R2|Postgres|Neon|Cloudflare|JWKS|ECONN|\d/);
  });
});

describe("a page whose data could not be loaded", () => {
  it("[AC-OPS-14.4] says the database is not available, in place of the usual failure text, and the rest of the app still opens", async () => {
    const api = { ...createDemoApi(), listWorkouts: async () => Promise.reject(new Error("503")) } as Api;
    setUnavailable(["database"]);
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <HealthPage today="2026-11-26" />
        </ApiProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("The database is not available right now. Try again in a few minutes.")).toBeTruthy();
    expect(screen.queryByText("That did not work. Try again.")).toBeNull();
    // The links to the other screens are still there: nothing is blank and nothing is stuck.
    expect(screen.getByRole("link", { name: /Weight/ })).toBeTruthy();
  });
});
