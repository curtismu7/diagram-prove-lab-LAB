import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JSDOM } from "jsdom";
import { SAMPLES, toHtml } from "@diagram-prove-lab/core";
import { setJsonView } from "./components/JsonPane.jsx";

let canvas;
vi.mock("./Canvas.jsx", () => ({ default: (props) => { canvas = props; return <div data-testid="canvas" />; } }));
const { default: App } = await import("./App.jsx");
const { default: Embed } = await import("./Embed.jsx");
const { default: WirePanel } = await import("./WirePanel.jsx");

function fakeApi() {
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url); const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.endsWith("api/diagrams")) return ok({ diagrams: SAMPLES.map((d) => ({ id: d.id, title: d.title, builtin: true })) });
    const d = SAMPLES.find((x) => x.id === decodeURIComponent(u.split("api/diagrams/")[1]));
    return d ? ok({ diagram: d, builtin: true }) : { ok: false, status: 404, json: async () => ({}) };
  });
}
const at = (q) => window.history.replaceState(null, "", `/${q}`);
beforeEach(() => { localStorage.clear(); setJsonView("form"); canvas = null; fakeApi(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); at(""); });
async function ready(id) {
  at(`?d=${id}`);
  render(<App />);
  await waitFor(() => expect(canvas?.diagram?.id).toBe(id));
  return canvas.diagram;
}
const tokenExchange = () => SAMPLES.find((d) => d.id === "token-exchange");

describe("WirePanel", () => {
  it("shows request, response, a decoded token table with plain-language meanings, the notice and the jargon", () => {
    render(<WirePanel wire={tokenExchange().steps[1].wire} />);
    expect(screen.getByTestId("wire")).toHaveTextContent("Example");
    expect(screen.getByTestId("wire-response")).toHaveTextContent("HTTP/1.1 200 OK");
    const rows = screen.getAllByTestId("wire-row");
    expect(rows.length).toBeGreaterThan(6);
    const aud = rows.find((r) => within(r).queryByText("aud"));
    expect(aud).toHaveTextContent(/the one service this token is FOR/i);
    expect(aud).toHaveClass("wire-focus");
    expect(screen.getByTestId("wire-token-0")).toHaveTextContent("sig-not-real");
    // the decoded values live in the shared JsonPane (Form view by default), the table beside them says what each field means
    expect(within(screen.getByTestId("wire-token-0")).getByLabelText("Token payload (decoded)")).toHaveTextContent("https://service-b.example.com");
    expect(screen.getByTestId("wire-notice")).toHaveTextContent("What to notice.");
    expect(screen.getByText("Jargon on this step")).toBeInTheDocument();
  });
  it("shows the request side when only a request is given", () => {
    render(<WirePanel wire={tokenExchange().steps[0].wire} />);
    expect(screen.getByTestId("wire-request")).toHaveTextContent("POST https://auth.example.com/token HTTP/1.1");
    expect(screen.queryByTestId("wire-response")).toBeNull();
  });
  it("a step with no traffic says so plainly", () => {
    render(<WirePanel wire={{ none: "this is a decision a person makes." }} />);
    expect(screen.getByTestId("wire-none")).toHaveTextContent("No network call here. this is a decision a person makes.");
    expect(screen.queryByTestId("wire-request")).toBeNull();
    expect(screen.queryAllByTestId("wire-row")).toHaveLength(0);
  });
  it("every JSON on the wire goes through the shared JsonPane: Form | JSON toggle, the token's focus claims marked, nothing capped", () => {
    const wire = tokenExchange().steps[1].wire;
    const { container } = render(<WirePanel wire={{ ...wire, tokens: wire.tokens.map((t) => ({ ...t, payload: { ...t.payload, tenant_tag: "t-1" }, focus: [...(t.focus || []), "tenant_tag"] })) }} />);
    expect(container.querySelectorAll("pre:not(.json)")).toHaveLength(0); // no hand-rolled pre
    const token = screen.getByTestId("wire-token-0");
    const payload = within(token).getByLabelText("Token payload (decoded)");
    expect(within(token).getAllByRole("button", { name: "Form" }).length).toBeGreaterThan(0);
    expect(within(token).getAllByRole("button", { name: "JSON" }).length).toBeGreaterThan(0);
    // Form view: the lab's own focus claim (not a default) is marked hot
    expect(payload.querySelector('[data-hot="true"] .jform__k')).not.toBeNull();
    expect([...payload.querySelectorAll('[data-hot="true"] .jform__k')].map((k) => k.textContent)).toContain("tenant_tag");
    // JSON view: the exact JSON text, the same claim stood out
    act(() => setJsonView("raw"));
    const raw = within(token).getByLabelText("Token payload (decoded)");
    expect(raw).toHaveTextContent('"aud": "https://service-b.example.com"');
    expect([...raw.querySelectorAll(".jtok--hot")].map((k) => k.textContent)).toContain('"tenant_tag"');
  });
  it("a JSON response body gets its own Form | JSON pane under the status line and headers", () => {
    render(<WirePanel wire={tokenExchange().steps[1].wire} />);
    const res = screen.getByTestId("wire-response");
    expect(within(res).getByLabelText("Response headers")).toHaveTextContent("HTTP/1.1 200 OK");
    act(() => setJsonView("raw"));
    const body = within(res).getByLabelText("Response body");
    expect(body).toHaveTextContent('"issued_token_type"');
    expect([...body.querySelectorAll(".jtok--hot")].map((k) => k.textContent)).toContain('"issued_token_type"'); // this lab's hot key
  });
  it("a form-encoded request body is not JSON, so it stays plain text", () => {
    render(<WirePanel wire={tokenExchange().steps[0].wire} />);
    expect(within(screen.getByTestId("wire-request")).queryByRole("button", { name: "JSON" })).toBeNull();
    expect(screen.getByTestId("wire-request")).toHaveTextContent("grant_type=urn:ietf:params:oauth:grant-type:token-exchange");
  });
  it("hostile text is shown as text", () => {
    const { container } = render(<WirePanel wire={{ request: { method: "GET", url: "https://a.example.com/<img src=x onerror=alert(1)>" }, notice: "<script>x</script>" }} />);
    expect(container.querySelector("img, script")).toBeNull();
  });
});

describe("wire in the app", () => {
  it("the step list has an On the wire section for a step with wire data and none for one without", async () => {
    await ready("auth-code-pkce");
    expect(screen.getByTestId("step-4-wire")).toHaveTextContent("HTTP/1.1 200 OK");
  });
  it("a diagram with no wire data shows no wire section", async () => {
    await ready("architectureoverview-overview");
    expect(document.querySelector(".wire")).toBeNull();
  });
  it("selecting an arrow shows its step's wire in the detail panel; a no-traffic step says so", async () => {
    await ready("auth-code-pkce");
    await act(async () => { canvas.onSelect({ edge: 3 }); }); // code + code_verifier
    expect(within(screen.getByTestId("detail-panel")).getByTestId("detail-wire-4")).toHaveTextContent("code_verifier=verifier-not-real");
    await act(async () => { canvas.onSelect({ edge: 1 }); }); // sign in
    expect(within(screen.getByTestId("detail-panel")).getByTestId("wire-none")).toHaveTextContent("No network call here.");
  });
  it("selecting a box offers the wire of each step it takes part in", async () => {
    await ready("token-exchange");
    await act(async () => { canvas.onSelect({ node: "sts" }); });
    for (const n of [1, 2]) expect(screen.getByTestId(`detail-wire-${n}`)).toBeInTheDocument(); // the token endpoint is in steps 1 and 2, not 3
    expect(screen.queryByTestId("detail-wire-3")).toBeNull();
  });
  it("presenter mode shows the active step's wire", async () => {
    const user = userEvent.setup();
    await ready("token-exchange");
    await user.click(screen.getByTestId("presenter"));
    await user.click(screen.getByTestId("simulate"));
    expect(await screen.findByTestId("now-wire")).toHaveTextContent("POST https://auth.example.com/token");
  });
  it("embed with panel=1 shows the wire for the active step", async () => {
    at("?embed=1&d=token-exchange&panel=1");
    const user = userEvent.setup();
    render(<Embed />);
    await screen.findByTestId("embed");
    await user.click(screen.getByTestId("simulate"));
    expect(await screen.findByTestId("embed-wire")).toHaveTextContent("subject_token");
  });
});

describe("wire in the HTML export", () => {
  it("the exported page shows the request, decoded token rows and notice for a step, built from text only", () => {
    const w = new JSDOM(toHtml(tokenExchange()), { runScripts: "dangerously", pretendToBeVisual: true }).window;
    const click = (id) => w.document.getElementById(id).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    click("next"); click("next"); // arrow 2 = step 2, the response with the new token
    const pan = w.document.getElementById("pan");
    expect(pan.textContent).toContain("On the wire");
    expect(pan.textContent).toContain("HTTP/1.1 200 OK");
    expect(pan.textContent).toContain("sig-not-real");
    expect(pan.querySelectorAll("table tr").length).toBeGreaterThan(6);
    expect(pan.textContent).toContain("What to notice.");
    expect(pan.querySelector("script, img")).toBeNull();
  });
  it("a no-traffic step is exported with its explanation", () => {
    const d = SAMPLES.find((x) => x.id === "delegation-chain");
    const w = new JSDOM(toHtml(d), { runScripts: "dangerously", pretendToBeVisual: true }).window;
    w.document.getElementById("next").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    expect(w.document.getElementById("pan").textContent).toContain("No network call here.");
  });
});
