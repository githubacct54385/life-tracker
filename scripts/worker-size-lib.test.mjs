import { describe, expect, it } from "vitest";
import { checkWorkerSize, WORKER_SIZE_BUDGET_BYTES, WORKER_SIZE_LIMIT_BYTES } from "./worker-size-lib.mjs";

describe("checkWorkerSize", () => {
  it("[AC-MIG-03.6] passes a small bundle", () => {
    expect(checkWorkerSize(300_000).ok).toBe(true);
  });

  it("[AC-MIG-03.6] fails over our budget, and over the platform limit with a different message", () => {
    const overBudget = checkWorkerSize(WORKER_SIZE_BUDGET_BYTES + 1);
    expect(overBudget.ok).toBe(false);
    expect(overBudget.reason).toContain("budget");
    const overLimit = checkWorkerSize(WORKER_SIZE_LIMIT_BYTES + 1, { budget: Infinity });
    expect(overLimit.ok).toBe(false);
    expect(overLimit.reason).toContain("platform limit");
  });

  it("[AC-MIG-03.6] the budget sits below the platform limit", () => {
    expect(WORKER_SIZE_BUDGET_BYTES).toBeLessThan(WORKER_SIZE_LIMIT_BYTES);
  });
});
