---
name: newsletter-generator
description: Executes the autonomous v6.0 tech newsletter generation pipeline. Covers 5 agents (Trend Scout, RAG Fetcher, Writer, Evaluator, Fact Checker), 8 live RSS sources, evidence-based RAG writing, and simulation fallback mode.
---

# Newsletter Generator Skill (v6.0)

## Goal
Autonomously research live tech trends, fetch full article content via RAG, write evidence-grounded copy, evaluate quality compliance, and fact-check output against retrieved sources — then output a structured Markdown newsletter for any technical niche.

## Pipeline Stages
1. **Agent A (Trend Scout)** — Gemini function-calling with 8 RSS tools (HackerNews, TechCrunch, Google, OpenAI, Zoho, Meta, Netflix, AWS). Deduplication via `past_issues.json`.
2. **RAG Fetcher** — Crawls article URLs, strips HTML, chunks into 800-word windows, embeds with `text-embedding-004`, performs cosine-similarity retrieval.
3. **Agent B (Writer)** — Writes newsletter using only retrieved evidence blocks. 3-attempt guardrail rewrite loop.
4. **Agent C (Evaluator)** — LLM-as-judge scoring (0–100) across 7 criteria. Security guardrail regex scan.
5. **Agent D (Fact Checker)** — Post-draft claim extraction and cross-reference against RAG chunks. Returns source coverage % score.

## Instructions

### Via React Dashboard (Recommended)
1. Start the server: `npm run dev`
2. Open `http://localhost:3000`
3. Select a niche, optional topic, optional model, and optional API key.
4. Click **"WAKE UP MULTI-AGENT NEWSROOM"**.
5. Monitor agent chat in the **💬 Live Agent Cooperation** tab.
6. View telemetry in the **📊 Observability Traces** tab.

### Via Python CLI
1. Activate venv: `venv\Scripts\activate`
2. Run: `python agent_pipeline.py --niche "<niche>" [--model "<model>"]`
3. Check output in `newsletters/newsletter_<niche>_<timestamp>.md`

## Constraints
- `GEMINI_API_KEY` must start with `AIza...` (Google AI Studio key).
- If the key is missing or returns 403, the pipeline **automatically** runs in **Simulation Mode** — all 5 agents still execute with curated templates.
- Newsletter archives are saved to `newsletters/` directory.
- Telemetry is stored in `run_history.json` (max 50 entries, rolling window).
- Past issue titles are deduplicated via `past_issues.json`.

## Output Files
| File | Description |
|---|---|
| `newsletters/*.md` | Timestamped newsletter archives |
| `run_history.json` | 6-span OTel telemetry per run |
| `agent_interactions.json` | Agent-to-agent message log (group chat source) |
| `past_issues.json` | Memory deduplication database |
