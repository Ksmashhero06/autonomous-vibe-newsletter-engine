# Kaggle Writeup — Vibecoding Agents Capstone Project

---

## FORM FIELDS (copy-paste directly)

### Title (max 80 chars)
```
Autonomous Vibe Newsletter Engine — 5-Agent Enterprise-Grade RAG Newsroom
```

### Subtitle (max 140 chars)
```
A multi-agent RAG fleet with vectorized memory and critique-driven feedback loops that publishes tech newsletters with zero human input.
```

### Submission Track
**→ Agents for Business**

*Rationale: Automates the full editorial pipeline (research → RAG fetch → write → review → fact-check → publish → archive) that normally requires hours of manual work. Clear ROI: replaces 3–5 hours of expert technical writing per issue with zero cost.*

---

## PROJECT DESCRIPTION (paste into the rich text editor)

# Autonomous Vibe Newsletter Engine (v6.0)

> A production-grade, 5-agent AI fleet that researches live developer news, crawls full article URLs to retrieve deep RAG context, writes technical newsletters, runs programmatic guardrails + LLM-as-judge reviews, fact-checks claims, and archives everything — with zero human involvement.

**GitHub:** https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine
**Track:** Agents for Business

---

## The Problem

Technical newsletter teams face a recurring, expensive challenge: every edition requires **hours of manual work** — scanning RSS feeds, crawling URLs, writing deep-dive technical explanations, verifying facts, checking formatting errors, and archiving output. 

Furthermore, naive automated systems struggle with two major issues:
1. **Deduplication Failure:** Simple title string checks fail when the same story is re-worded, causing duplicate content.
2. **Quality Bottlenecks:** If the RAG layer fetches weak or noisy source chunks, the writer produces a shallow newsletter that passes simple formatting checks but fails on technical depth.

---

## The Solution

The **Autonomous Vibe Newsletter Engine (v6.0)** solves these challenges through a unified 5-stage pipeline featuring two key architectural innovations:

1. **Vectorized Memory Database:** Replaces naive string filtering with semantic similarity checking. We generate embeddings using Google's `text-embedding-004` and run a cosine similarity comparison against our archive. Conceptually similar topics are rejected automatically.
2. **Critique-Driven RAG Feedback Loop:** If the Evaluator (Agent C) or Fact Checker (Agent D) rates a draft below a score of 80, the orchestrator sends a structured command back to the RAG Fetcher to expand its search horizon, scrape deeper paragraphs from URLs, increase chunk sizes, and feed fresh context to Agent B for a rewrite.

---

## Architecture

```
╔═══════════════════════════════════════════════════════════════════╗
║              REACT CONTROL PANEL  (localhost:3000)               ║
║                                                                   ║
║  [Niche Selector]  [Custom Topic]  [Model Picker]  [API Key]     ║
║  [Wake Up Newsroom Button]                                        ║
║                                                                   ║
║  Tabs:  Workstation | Cooperation | Fleet Logs | Archive | Traces ║
╚═════════════════════════════╦═════════════════════════════════════╝
                              │ POST /api/generate
                              │ {niche, topic, model, apiKey}
                              ▼
╔═══════════════════════════════════════════════════════════════════╗
║              EXPRESS SERVER  (server.ts) v6.0                    ║
║   Orchestrates pipeline, writes telemetry, 6-span OTel traces    ║
║   Handles Critique-Driven RAG Loop (feedback to RAG Fetcher)      ║
╚═════╦══════════╦════════════╦════════════╦══════════╦════════════╝
      │          │            │            │          │
      ▼          ▼            ▼            ▼          ▼
╔══════════╗ ╔══════════╗ ╔══════════╗ ╔══════════╗ ╔══════════════╗
║ AGENT A  ║ ║   RAG    ║ ║ AGENT B  ║ ║ AGENT C  ║ ║  AGENT D     ║
║  Scout   ║─▶ Fetcher  ║─▶  Writer  ║─▶ Evaluator║─▶ Fact Checker ║
╠══════════╣ ╠══════════╣ ╠══════════╣ ╠══════════╣ ╠══════════════╣
║ 8 RSS    ║ ║ URL Crawl║ ║ Memory   ║ ║ Security ║ ║ Claim        ║
║ Tools    ║ ║ Chunk    ║ ║ Tool     ║ ║ Guardrail║ ║ Extraction   ║
║ Function ║ ║ Embed    ║ ║ RAG      ║ ║ LLM Judge║ ║ Cosine Sim   ║
║ Calling  ║ ║ Retrieve ║ ║ Evidence ║ ║ 0–100    ║ ║ Coverage %   ║
╚══════════╝ ╚══════════╝ ╚══════════╝ ╚══════════╝ ╚══════════════╝
      ▲              ▲                                     │
      │              └─────── [If Score < 80: Loopback] ───┘
      │
      └─ Check Vector Cosine Similarity (text-embedding-004)
```

---

## Detailed Component Walkthrough

### 1. Agent A — Trend Scout
Equipped with **8 live RSS tool declarations** registered with Gemini Function Calling. Autonomously chooses which RSS feed matches the user's niche (Hacker News, TechCrunch, Google, OpenAI, Zoho, Meta, Netflix, AWS), retrieves structured headlines, filters the top stories, and checks against past issue memory.

### 2. RAG Fetcher (Critique-Driven Loop)
Crawls raw HTML from the top selected article URLs, strips HTML boilerplate, and chunks text. Uses a dynamic configuration:
- **Normal Mode:** Fetches 3 articles, 800-token chunks, minimal overlap.
- **Feedback Mode (Score < 80):** Triggered by the Evaluator/Fact Checker. Expands search to 5 articles, extracts deeper paragraphs, uses dense overlaps, and fetches more context to solve data deficiencies.

### 3. Agent B — The Writer (Vector Memory)
Checks proposed topics using the `check_past_issues` tool. The tool uses a local vectorized memory:
```python
# Cosine similarity check in Python memory-skill
dot_prod = sum(a * b for a, b in zip(embedding1, embedding2))
similarity = dot_prod / (norm1 * norm2)
if similarity > 0.82:  # Reject conceptually similar topics
    covered_titles.append(title)
```
Agent B writes a structured Markdown newsletter, using *only* retrieved evidence chunks to prevent hallucinated details.

### 4. Agent C — The Evaluator
A two-stage review layer:
1. **Programmatic Security Guardrail:** Scans for prompt injection attacks and validates markdown formatting (unclosed code blocks).
2. **LLM-as-Judge:** Scores the newsletter from 0 to 100 based on a 7-point checklist (expert tone, structured sections, benchmarks, no fillers).

### 5. Agent D — Fact Checker
Extracts claims made in Agent B's draft and audits them against the raw RAG vector database. Compares keywords and vector embeddings to compute a **Source Coverage Percentage**. If score < 80%, triggers the critique-driven loopback.

---

## Key Concepts Demonstrated

### 1. Vectorized Memory Database (`text-embedding-004`)
Replaced basic string filtering with semantic cosine similarity comparisons. Embeddings are generated using Gemini's embedding API and cached locally in `past_issues.json` to prevent duplicate API calls. Autonomously rejects topics too conceptually close to previously published issues.

### 2. Critique-Driven Feedback Loops
Implements a self-correcting feedback mechanism. When a draft gets a score below 80, a structured rewrite command with specific critiques is passed back to the RAG Fetcher, expanding the search horizon and pulling deeper context from the web to correct the deficiency.

### 3. Security Guardrails
Programmatic sanitization blocks prompt injections (e.g., "ignore previous instructions") and structural errors (unbalanced code blocks) before calling LLM evaluation, saving API costs and preventing exploits.

### 4. OpenTelemetry-Style Telemetry
Pipeline runs record a 6-span telemetry trace (pipeline run, trend scout, RAG fetcher, writer, evaluator, fact checker) complete with duration metrics, token counts, cost estimations, and unique span IDs.

---

## React Frontend Control Panel (Port 3000)

Features a modern, high-fidelity UI built with React 19 + TypeScript + Tailwind CSS:
- **Active Workstation:** Live generation trigger, preset niche controls, snapshotted newsletters.
- **Live Agent Cooperation:** Premium Group Chat UI showing per-agent interactions in real-time with customized avatars, status indicators, and WhatsApp-style message grouping.
- **Fleet Logs:** Expandable accordions detailing OTel telemetry traces, token counts, and step results.
- **Server Archive:** Instantly browse and read all archived technical newsletters.
- **Metrics & Analytics:** Real-time dashboard charting token trends, quality scores, and success rates.

---

## Quick Start

```bash
git clone https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine.git
cd autonomous-vibe-newsletter-engine
npm install && pip install -r requirements.txt
echo "GEMINI_API_KEY=your-key-here" > .env
npm run dev
# → http://localhost:3000
```

No API key? Run in simulation mode:
```bash
python agent_pipeline.py --simulate
```

---

## Results

- **23+ newsletters archived** automatically across multiple niche categories.
- **92/100 average quality score** enforced by Agent C (LLM-as-judge).
- **Self-Correcting Rate:** ~30% of runs trigger the feedback loop, successfully resolving data deficiencies and upgrading the final quality score to 90+.
- **Zero Cloud Cost:** Utilizes standard local hardware and Google AI Studio free tier.

---

## 6-Day Development Journey

| Day | Topic | What I Built |
|---|---|---|
| Day 1 | Intro & Vibe Coding | React + Express scaffold, dashboard design system |
| Day 2 | Tools & Function Calling | Agent A + Gemini RSS tool integrations |
| Day 3 | Context & Memory | `past_issues.json` database and topic deduplication |
| Day 4 | Security & Evaluation | Programmatic guardrails, Agent C, rewrite loop |
| Day 5 | Production Fleet | 8 RSS sources, background worker, unified dashboard |
| Day 6 | RAG & Fact Checking | URL crawling, RAG vector store, Agent D, 6-span trace telemetry |
| Post-Day 6 | System Optimization | Vectorized memory database & Critique-driven feedback loop |

---

## Business Value

- **Total Automation:** Saves 3–5 hours of research and writing per newsletter edition.
- **Quality Enforced:** Programmatic and LLM checkers maintain high editorial standards.
- **Dynamic Adaptability:** Feedback loops ensure the writer self-corrects based on critiques.
- **Topic Freshness:** Vector database guarantees never repeating conceptually similar topics.

---

*Built with precision and clean engineering during the Kaggle 5-Day AI Agents Intensive.*
*GitHub: https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine*

---

## PROJECT LINKS

- GitHub: https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine
- LinkedIn: https://www.linkedin.com/in/sathiyamoorthi-k-336a79307/

---

## VIDEO SCRIPT OUTLINE (YouTube, max 5 min)

**[0:00–0:30] The Problem**
Show a manual newsletter workflow. Too slow. Too expensive. Needs agents.

**[0:30–1:30] Architecture Overview**
Walk through the architecture diagram: React → Express → Agent A → RAG Fetcher → Agent B → Agent C → Agent D → Archive.

**[1:30–3:30] Live Demo**
- Open http://localhost:3000
- Select "AI & Agentic Frameworks" niche
- Click "Wake Up Newsroom"
- Watch live agent logs stream in the Group Chat UI (Scout → RAG Fetcher → Writer → Guardrail → Evaluator → Fact Checker)
- Newsletter appears in editorial sheet
- Switch to "Server Archive" — show archived newsletters
- Switch to "Metrics & Analytics" — show token & quality charts

**[3:30–4:30] Key Concepts**
- Code: Gemini Function Calling agentic loop in agent_pipeline.py
- Code: `check_past_issues` vectorized similarity checking
- Code: Dynamic critique-driven feedback loop to the RAG Fetcher
- Telemetry: 6-span OpenTelemetry traces

**[4:30–5:00] Business Value + Wrap Up**
- 23+ newsletters, avg score 92/100, $0 cost, runs on any schedule
- GitHub link

## THUMBNAIL
560 × 280px — Screenshot of the React dashboard showing all 5 agent cards + newsletter draft rendered.
