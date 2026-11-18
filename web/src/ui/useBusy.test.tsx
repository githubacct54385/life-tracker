import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBusy } from "./useBusy";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useBusy", () => {
  it("[AC-SET-02.7] is busy while the action runs and idle after it finishes", async () => {
    const { result } = renderHook(() => useBusy());
    const gate = deferred<string>();
    let outcome!: Promise<string | undefined>;
    act(() => {
      outcome = result.current[1](() => gate.promise);
    });
    expect(result.current[0]).toBe(true);
    await act(async () => {
      gate.resolve("done");
      await outcome;
    });
    expect(result.current[0]).toBe(false);
    expect(await outcome).toBe("done");
  });

  it("[AC-SET-02.7] ignores a second call while the first is running, so a double tap saves once", async () => {
    const { result } = renderHook(() => useBusy());
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    await act(async () => {
      const first = result.current[1](action);
      const second = result.current[1](action); // same tick, before any repaint
      expect(await second).toBeUndefined();
      gate.resolve();
      await first;
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("[AC-SET-02.7] is idle again after the action fails, and can be used again", async () => {
    const { result } = renderHook(() => useBusy());
    await act(async () => {
      await result.current[1](() => Promise.reject(new Error("synthetic"))).catch(() => undefined);
    });
    expect(result.current[0]).toBe(false);
    const again = vi.fn(async () => 1);
    await act(async () => void (await result.current[1](again)));
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("[AC-SET-02.7] does not touch state after the component is gone", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useBusy());
    const gate = deferred();
    let outcome!: Promise<unknown>;
    act(() => {
      outcome = result.current[1](() => gate.promise);
    });
    unmount();
    gate.resolve();
    await outcome;
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
