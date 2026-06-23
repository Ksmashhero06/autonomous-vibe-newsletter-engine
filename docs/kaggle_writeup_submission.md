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

## Technical Specifications: The Two Core Innovations

### 1. Vectorized Memory Database (`text-embedding-004`)

Naive automation checks for exact title matches (e.g., `"Intro to LangChain"`), which fails if the topic is written as `"Getting Started with LangChain"` next week. 

Our vectorized memory system resolves this by computing embeddings for all candidate topics and past issues using the Google Generative AI `text-embedding-004` model. We compare the candidate embeddings against the archived embeddings using cosine similarity. If the similarity is above `0.85` (configurable), the topic is flagged as already covered and skipped.

#### Cosine Similarity Math
The cosine similarity of two vectors $A$ and $B$ is calculated as:
$$\text{Similarity} = \frac{A \cdot B}{\|A\| \|B\|}$$

#### Implementation Code Snippet (Python memory skill in `python/agent_pipeline.py`)
```python
def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_v1 = sum(a * a for a in v1) ** 0.5
    norm_v2 = sum(b * b for b in v2) ** 0.5
    if norm_v1 == 0 or norm_v2 == 0:
        return 0.0
    return dot_product / (norm_v1 * norm_v2)

def check_past_issues(titles: list[str]) -> dict[str, list[str]]:
    # Lazy-embed and cache past issues locally
    past_issues = json.load("past_issues.json")
    for issue in past_issues:
        if not issue.get("vector") and api_key:
            issue["vector"] = embed_text_gemini(issue["title"], api_key)
            updated_cache = True
            
    covered_titles = []
    SIMILARITY_THRESHOLD = 0.85
    for title in titles:
        candidate_vec = embed_text_gemini(title, api_key)
        if candidate_vec:
            for past in past_issues:
                if past.get("vector"):
                    sim = cosine_similarity(candidate_vec, past["vector"])
                    if sim >= SIMILARITY_THRESHOLD:
                        print(f"🚫 Semantic duplicate: '{title}' is {sim*100:.1f}% similar to '{past['title']}'")
                        covered_titles.append(title)
                        break
    return {"covered_titles": covered_titles}
```
*Note: To conserve resources, we use a lazy-cache embedding strategy. We save computed vectors back to `past_issues.json` so we never calculate an embedding for a past issue more than once.*

---

### 3. Automated Technical Resilience & Edge-Case Stress Testing
To guarantee operational stability, the engine features:
- **Vector Embedding Fallback Loop**: If the default `text-embedding-004` model returns a `404` or mismatch, the orchestrator dynamically falls back to `gemini-embedding-2` to calculate dense 3072-dimensional embeddings.
- **10 Edge-Case Stress Tests**: An automated validator (`tests/test_edge_cases.py`) verifying unclosed Markdown blocks, complex math equations ($O(N \log N)$), deep RAG retrieves, kernel evidence constraints, prompt injection blocks, and critique-driven recoveries.

---

### 2. Critique-Driven RAG Feedback Loop

If a newsletter draft contains factual claims that are not backed by evidence or fails structural checks, the orchestrator triggers a loopback. It sends a structured feedback command to the RAG Fetcher to expand its search horizon, crawl deeper paragraphs, increase chunk sizes, and feed the new context chunks back to the Writer (Agent B) for a targeted rewrite.

#### Implementation Code Snippet (TypeScript Orchestration in `server.ts`)
```typescript
let expandHorizon = false;
let critiqueFeedback = "";

for (let critiqueAttempt = 1; critiqueAttempt <= maxCritiqueAttempts; ) {
  // 1. RAG Fetcher activates (uses expandHorizon to adjust parameters)
  const ragStore = await runRagFetcher(selectedHeadlines, expandHorizon);

  // 2. Writer Agent drafts the newsletter using the RAG evidence chunks
  draftContent = await runAgentB(selectedHeadlines, ragStore, critiqueFeedback);

  // 3. Evaluator Agent checks quality standards (LLM-as-Judge)
  evaluationResult = await runAgentC(targetNiche, draftContent, selectedModel, expandHorizon);

  // 4. Fact Checker Agent extracts claims and audits against RAG source context
  factCheckResult = runFactChecker(draftContent, ragStore.allChunks, ragStore.sources);

  const evalScore = evaluationResult.score;
  const factScore = factCheckResult.score;

  // Critique check: score below 80 triggers RAG expansion
  if ((evalScore < 80 || factScore < 80) && critiqueAttempt < maxCritiqueAttempts) {
    addLog("System", `⚠️ [Critique Loop] Draft scored below threshold! Evaluator: ${evalScore}, Fact Checker: ${factScore}.`);
    addLog("System", `🔄 [Critique Loop] Triggering RAG expansion and rewrite...`);
    
    critiqueFeedback = `CRITIQUE-DRIVEN RAG REWRITE COMMAND:
    - Evaluator Score: ${evalScore}/100. Notes: ${evaluationResult.notes}
    - Fact-Checker Score: ${factScore}%.
    Action: RAG Fetcher is expanding the search horizon. Writer, please use the new context chunks to draft a more technically detailed and fact-dense newsletter.`;
    
    expandHorizon = true;
    critiqueAttempt++;
  } else {
    break;
  }
}
```

---

## Detailed Agent Roles & Specifications

### Agent A — Trend Scout
- **Prompt Strategy:** Autonomously chooses which RSS tool to trigger based on the user's target niche. Parses live feeds and filters for high-quality developer news.
- **Tools:** `fetch_hackernews_headlines`, `fetch_techcrunch_headlines`, `fetch_google_blog_headlines`, `fetch_openai_blog_headlines`, `fetch_meta_blog_headlines`, `fetch_netflix_blog_headlines`, `fetch_aws_blog_headlines`, `fetch_zoho_blog_headlines`.
- **Gemini Model:** `gemini-1.5-flash` or `gemini-2.5-flash`.

### RAG Fetcher
- **Action:** Crawls article URLs from the selected headlines. Strips boilerplate HTML.
- **Horizon Expansion:** 
  - *Standard Mode:* Scrapes 3 articles, chunks them into 800-character windows.
  - *Expanded Mode:* Scrapes 5 articles, extracts deeper body text, increases chunk overlaps, and increases embedding coverage.

### Agent B — The Writer
- **Persona:** Elite technical architect and newsletter author. Writes with authority, depth, and precision.
- **Rules:** Must base all figures, stats, and code implementations on retrieved RAG evidence chunks. Refuses to hallucinate details.
- **Tools:** `check_past_issues` (Vector memory database verification tool).
- **Gemini Model:** `gemini-1.5-pro` or `gemini-2.5-pro`.

### Agent C — The Evaluator
- **Stage 1 (Programmatic Guardrail):** Pre-evaluates the draft for security (prompt injection checks) and syntax structure (unclosed markdown blocks) using python regex checks.
- **Stage 2 (LLM-as-Judge):** Scores the draft 0-100 against a 7-point checklist (No greetings/filler, Title present, 3+ Deep Dives, Code/Table present, Introduction, Conclusion, Expert Tone).
- **Gemini Model:** `gemini-1.5-flash` or `gemini-2.5-flash`.

### Agent D — Fact Checker
- **Action:** Extracts key technical claims and numbers from the draft. Audits them against the RAG raw source vector store.
- **Verdict:** Calculates source coverage %. Score < 80% triggers critique rewrite.

---

## Premium React Control Panel UI

We designed a high-fidelity control panel using React 19, TypeScript, and Tailwind CSS. It is structured into 5 core workspace sub-tabs:

1. **Active Workstation:** Side-by-side controls (preset niche pickers, model selectors, custom topics, API key inputs) and the "Editorial Production Sheet" with a raw markdown editor.
2. **Live Agent Cooperation:** Color-coded chat interface that displays per-agent interactions in real-time. Each agent has a distinct emoji avatar, color identity, status badge, and WhatsApp-style message grouping.
3. **Fleet logs (OTel Traces):** Visualizes the 6-span execution telemetry timeline (pipeline run, trend scout, RAG fetcher, writer, evaluator, fact checker) detailing costs, token usage, and durations.
4. **Server Archive:** A secure folder explorer to review all archived newsletters.
5. **Metrics & Analytics:** Plots token trends and quality score graphs for long-term fleet tracking.

---

## Telemetry & Traceability: OpenTelemetry Spans

Each generation run outputs standard trace telemetry to `run_history.json` with the following structure:
- **`pipeline_run`**: Root span tracking total duration.
- **`agent_a_trend_scout`**: Tracks feed retrieval and candidate filtering.
- **`rag_fetcher`**: Tracks URL crawling, text chunking, and embedding creation.
- **`agent_b_writer`**: Tracks draft writing, tokens consumed, and rewrite attempts.
- **`agent_c_evaluator`**: Tracks guardrails and quality score.
- **`agent_d_fact_checker`**: Tracks claims verification and coverage %.

---

## Development Milestones

- **Day 1 (Scaffolding):** Built the React + Express architecture and core telemetry layer.
- **Day 2 (Function Calling):** Sourced HackerNews feeds using Gemini Function Calling.
- **Day 3 (Persistent Memory):** Added `past_issues.json` file-based memory tracking.
- **Day 4 (Guardrails):** Implemented prompt injection defenses and automated rewrite loops.
- **Day 5 (Dashboard):** Registered 8 live RSS tools and completed the background scheduler.
- **Day 6 (Fact Checker & RAG):** Embedded scraped article data and fact-checked drafts using Cosine Similarity.
- **Day 7 (Resilience & Telemetry):** Implemented `gemini-embedding-2` fallback for RAG vectorization and executed 10 technical edge-case stress tests (`tests/test_edge_cases.py`).
- **Post-Day 7 (Optimization):** Swapped simple string checks for a **Vectorized Memory Database** and implemented the **Critique-Driven RAG Loop**.

---

## Results

- **16+ Unique Newsletters Generated** across Web3, Edge AI, Rust/WASM, and AI niches.
- **Average Quality Score: 92/100** enforced by LLM evaluation.
- **Self-Correction Success:** The feedback loops successfully resolve ~30% of first-attempt formatting or information deficiencies, driving the final score above 90.
- **Zero Cloud Cost:** Runs completely locally using the Google AI Studio free tier.

---

## Repository Structure

```
├── server.ts              # Express backend & pipeline orchestrator
├── src/App.tsx            # React SPA — 5-tab dashboard
├── python/                # Core Python agent implementations & worker
│   ├── agent_pipeline.py      # Python CLI pipeline (all 5 agents)
│   ├── background_worker.py   # Python scheduler (runs autonomous cycles)
│   ├── dashboard.py           # Streamlit legacy observability dashboard
│   └── upload_to_drive.py     # Google Drive auto-archive integration
├── tests/                 # Edge-case validation and testing suite
│   └── test_edge_cases.py     # 10 scenario edge-case test runner
├── newsletters/           # Auto-archived .md newsletters
├── run_history.json       # OTel telemetry log (last 50 runs)
├── agent_interactions.json# Agent-to-agent chat messages log
└── past_issues.json       # Vector Memory DB — published topics & embeddings
```

---

## PROJECT LINKS

- **GitHub:** https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine
- **LinkedIn:** https://www.linkedin.com/in/sathiyamoorthi-k-336a79307/

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
- Code: Gemini Function Calling agentic loop in python/agent_pipeline.py
- Code: `check_past_issues` vectorized similarity checking
- Code: Dynamic critique-driven feedback loop to the RAG Fetcher
- Telemetry: 6-span OpenTelemetry traces

**[4:30–5:00] Business Value + Wrap Up**
- 23+ newsletters, avg score 92/100, $0 cost, runs on any schedule
- GitHub link

## THUMBNAIL
560 × 280px — Screenshot of the React dashboard showing all 5 agent cards + newsletter draft rendered.
