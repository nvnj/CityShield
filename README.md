# CityShield

Real-time situational awareness agent for large public events — 2026 World Cup.

> Built for the Google Cloud Rapid Agent Hackathon · **Elastic track** · Smart Cities
> Gemini · Google Cloud ADK · Elastic MCP · Computer Vision · FastAPI · React

---

## What it does

CityShield ingests crowd density (estimated from real video using computer vision), traffic flow, and public sentiment signals into Elasticsearch. Every 30 seconds — or immediately when a tripwire fires — Gemini reasons across all three streams to form a situational assessment, then plans a graded, sequenced operator response. A human operator approves before anything external fires.

It is not a dashboard with alerts bolted on. Gemini reasons about the *joint* signal picture — a density spike that coincides with a sentiment drop and a transit surge is a different situation than any one signal alone. That cross-stream correlation is the agentic core.

## Why it matters

Large events are complex operational environments. Early detection of crowd crush risk, traffic irregularities, or sentiment deterioration requires operators to synthesize multiple signals simultaneously — a cognitive load that leads to delayed responses. CityShield automates the synthesis and delivers a sequenced, actionable plan while keeping the human in command.

## How it works

```
Video frames
  → CV crowd estimator   density + headcount per zone → Elasticsearch
  → Synthetic feeders    traffic + sentiment          → Elasticsearch

Every 30s (or on tripwire):
  → Correlation agent    Gemini fuses all 3 streams → situational assessment
  → Response planner     Gemini sequences actions   → graded response plan
  → Incident writer      Gemini writes operator packet
  → cityshield-alerts    incident written to Elastic

Operator console:
  → Human approves → notify fires
```

![Architecture](docs/architecture.png)

## Scope & ethics

- **Aggregate density only.** No individual identification, no face detection, no tracking IDs.
- **No legally gated actions.** CityShield does not dispatch EMS, call 911, or reroute city traffic. It provides operational intelligence to venue staff.
- **Human in command.** No external action fires without explicit operator approval.

## Setup

```bash
git clone <repo>
cd cityshield
cp .env.example .env        # add Elastic + Google credentials
uv sync
make run-api                # FastAPI backend
make run-console            # React console
make run-feeders            # synthetic traffic + sentiment feeders
```

Requires Python 3.12, Node.js 18+. See [SETUP_AND_BUILD.md](SETUP_AND_BUILD.md).

## Demo

```bash
make demo
```

Starts the replay feeders (a scripted crowd surge), waits for data to flow into Elasticsearch, runs an assessment, and opens the console. The surge triggers a "severe" multi-signal assessment with a sequenced response plan.

## Tech

| Layer | Choice |
|---|---|
| Reasoning | Gemini (Google ADK) |
| Data / MCP | Elastic (Elasticsearch + Kibana + Elastic MCP) |
| CV estimation | OpenCV / crowd-counting model |
| Backend | Python · FastAPI |
| Console | React · Vite · Tailwind |
| Hosting | Cloud Run (API) · Firebase Hosting (console) |

## License

Apache-2.0. See [LICENSE](LICENSE).
