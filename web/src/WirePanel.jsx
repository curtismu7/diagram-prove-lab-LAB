import { useMemo } from "react";
import { wireView } from "@diagram-prove-lab/core";
import Json from "./components/JsonPane.jsx";

// "On the wire": the example messages and tokens behind one step. Text only (React escapes it); every value is a labelled example.
// Every JSON shown here goes through the shared JsonPane (Form | JSON, full view). Keys this lab's messages are about, beside the defaults
// (sub, act, aud, scope, ...): the exchange target, the kind of token asked for and handed back, and the approval ticket.
const MESSAGE_HOT = ["audience", "resource", "requested_token_type", "issued_token_type", "token_type", "approval_id"];

function Message({ title, m, testId }) {
  return (
    <div className="wire-msg" data-testid={testId}>
      <h5>{title}</h5>
      <Json value={m.text} label={title} hot={MESSAGE_HOT} />
      {m.notice && <p className="muted small">{m.notice}</p>}
    </div>
  );
}

// src is the step's own token (its decoded header and payload, and the claims to focus on); t is the same token prepared for reading.
function Token({ t, src, i }) {
  const [h, p, s] = t.parts;
  return (
    <div className="wire-token" data-testid={`wire-token-${i}`}>
      <h5>Token: {t.label}</h5>
      <Json value={`${h}.${p}.${s}`} label="The token as sent: header, payload, signature" />
      <p className="muted small">A token is three parts joined by dots: a header (how it was signed), a payload (the claims, meaning facts it states), and a signature. The header and payload are only encoded, not secret, so they are decoded here.</p>
      <Json value={src.header} label="Token header (decoded)" hot={src.focus} />
      <Json value={src.payload} label="Token payload (decoded)" hot={src.focus} />
      <table>
        <thead><tr><th>Part</th><th>Field</th><th>What this means</th></tr></thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.part + r.name} className={r.focus ? "wire-focus" : undefined} data-testid="wire-row">
              <td>{r.part}</td><td><code>{r.name}</code></td><td>{r.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WirePanel({ wire, testId = "wire" }) {
  const v = useMemo(() => wireView(wire), [wire]);
  return (
    <section className="wire" aria-label="On the wire" data-testid={testId}>
      <h4>On the wire <span className="chip">Example</span></h4>
      {v.none ? <p data-testid="wire-none"><strong>No network call here.</strong> {v.none}</p> : (
        <>
          <p className="muted small">Example only: made-up hosts, ids and signatures, nothing real. A request is what the caller sends; a response is the answer. Headers are labelled settings sent first; the body is the content.</p>
          <div className="wire-cols">
            {v.request && <Message title="Request" m={v.request} testId="wire-request" />}
            {v.response && <Message title="Response" m={v.response} testId="wire-response" />}
          </div>
          {v.tokens.map((t, i) => <Token key={i} t={t} src={wire.tokens[i]} i={i} />)}
        </>
      )}
      {v.notice && <p className="wire-notice" data-testid="wire-notice"><strong>What to notice.</strong> {v.notice}</p>}
      {v.terms.length > 0 && (
        <details className="wire-terms">
          <summary>Jargon on this step</summary>
          <dl>{v.terms.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
        </details>
      )}
    </section>
  );
}
