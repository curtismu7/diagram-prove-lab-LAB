import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import App from "./App.jsx";
import { SAMPLES } from "@diagram-prove-lab/core";

// The header shows this lab's own Verified / In progress mark, read from the same /api/shelf call the Shelf link makes (relative path "api/shelf").
// Through the lab-proxy that call reaches the shelf, whose payload lists every demo with its mark; opened on its own port the lab answers
// with only { shelfUrl }, so there is no mark.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mark = (status, label, extra = {}) => ({ status, label, note: "", updatedAt: "2026-11-15", source: "shipped", ...extra });

function stubApi(shelf) {
  globalThis.fetch = vi.fn(async (url) => {
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    const u = String(url);
    if (u.endsWith("api/shelf")) return ok(shelf);
    if (u.endsWith("api/info")) return ok({ mode: "local", hosted: false, source: "mock", realAvailable: false });
    if (u.endsWith("api/health")) return ok({ schema: "demo-health/1", state: "ready", mode: "local", mockOnly: false });
    if (u.endsWith("api/diagrams")) return ok({ diagrams: SAMPLES.map((d) => ({ id: d.id, title: d.title, builtin: true })) });
    if (u.includes("api/diagrams/")) {
      const id = decodeURIComponent(u.split("api/diagrams/")[1]);
      return ok({ diagram: SAMPLES.find((d) => d.id === id), builtin: true });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

describe("verification mark in the header", () => {
  it("shows this lab's own mark beside the Shelf link, and no other lab's", async () => {
    stubApi({ shelfUrl: "http://shelf.example", demos: [
      { id: "other-lab", verification: mark("in-progress", "In progress") },
      { id: "diagram-prove-lab", verification: mark("verified", "Verified", { note: "Every claim proved on the mock" }) },
    ] });
    render(<App />);
    await screen.findByTestId("picker");
    const bar = within(document.querySelector(".top-menu"));
    expect(await bar.findByText("Verified")).toBeInTheDocument();
    expect(bar.getByRole("link", { name: "Shelf" })).toBeInTheDocument();
    expect(bar.queryByText("In progress")).toBeNull();
    expect(document.querySelectorAll(".verify")).toHaveLength(1);
    expect(bar.getByText("Verified").closest(".verify")).toHaveAttribute("title", expect.stringContaining("Every claim proved on the mock"));
  });

  it("shows nothing when the lab is opened on its own port (only { shelfUrl }) or the shelf has no mark for it", async () => {
    for (const shelf of [
      { shelfUrl: "http://shelf.example" },
      { shelfUrl: "http://shelf.example", demos: [{ id: "diagram-prove-lab", verification: null }] },
      { shelfUrl: "http://shelf.example", demos: [{ id: "diagram-prove-lab", verification: mark("none", "") }] },
    ]) {
      stubApi(shelf);
      const { unmount } = render(<App />);
      await screen.findByTestId("picker");
      const bar = within(document.querySelector(".top-menu"));
      expect(await bar.findByRole("link", { name: "Shelf" })).toBeInTheDocument(); // the shelf answered, and still no badge
      expect(document.querySelector(".verify")).toBeNull();
      unmount();
    }
  });

  it("App.jsx renders the badge with this lab's own shelf id (removing the line fails this)", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const entry = JSON.parse(fs.readFileSync(path.join(dir, "..", "..", "docs", "shelf-entry.json"), "utf8")).demos[0].id;
    expect(entry).toBe("diagram-prove-lab");
    expect(fs.readFileSync(path.join(dir, "App.jsx"), "utf8")).toContain(`<VerifyMark id="${entry}"`);
  });
});
