# Reefer Agent — UI redesign

Interactive prototype for the Reefer Agent work queue and Ask AI panel.

## What's included

- Sidebar rows with **pro bill**, **customer**, **alert type**, alert severity, **customer reefer sensitivity**, and alert count
- Sort by **alert sent time** (newest first) — not chat/interaction time
- Hidden **delivered** and **canceled** shipments
- Multi-select **customer** filter with selected chips at the top
- Insight strip with clickable counts for **alert severity** and **customer reefer sensitivity**
- Customer-profile sensitivity (Low / Medium / High) configured by fleet team — e.g. PharmaCare → High
- Expanded **Ask AI** + **Collapse to chat** floating widget (icon / small window)
- Alert cards show type + severity; **P11441670** includes both temp deviation and mode mismatch
- Placeholder **temperature band** config (no-alert deviation ranges)

## Severity rules

| Severity | Rule |
|----------|------|
| High | Reefer off, or temperature deviation **> 10°F** |
| Medium | Temperature deviation **4–10°F**, or mode mismatch |
| Low | Temperature deviation **≤ 4°F** (above normal band) |

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173).

## Notes for engineering follow-up

1. Confirm alert generation cadence (UI currently labels **batch every 5 min** — verify with the backend).
2. Finalize temperature band / normal-deviation config when product sends ranges.
3. Wire Ask AI to the real agent so list queries still return **full count + complete results**.
