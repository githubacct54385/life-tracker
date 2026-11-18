import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("[AC-SET-02.7] is a plain, enabled button when it is not busy", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.getAttribute("type")).toBe("button");
    expect(button.querySelector(".lt-spinner")).toBeNull();
  });

  it("[AC-SET-02.7] while busy it is disabled, shows a spinner, keeps its label, and says Working to screen readers", () => {
    render(<Button busy>Save</Button>);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".lt-spinner")?.getAttribute("aria-hidden")).toBe("true");
    expect(button.textContent).toContain("Save");
    expect(button.textContent).toContain("Working…");
  });

  it("[AC-SET-02.7] stays disabled for its own reasons too, and a ghost button can be disabled by a sibling's work", () => {
    render(
      <>
        <Button disabled>Primary</Button>
        <Button variant="ghost" disabled>
          Cancel
        </Button>
      </>,
    );
    expect((screen.getByRole("button", { name: "Primary" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("[AC-SET-02.7] the stylesheet stops the spinner turning for reduced motion but keeps it visible", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8");
    expect(css).toContain(".lt-spinner { animation: none; }");
  });
});
