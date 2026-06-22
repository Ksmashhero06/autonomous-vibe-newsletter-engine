# The Autonomous Vibe Newsletter Engine 🤖📰

> **v6.0.0 — Enterprise-Grade Evidence-Based RAG Platform**
> Built during the Kaggle intensive course: **"5-Day AI Agents: Intensive Vibe Coding Course With Google"**

An autonomous multi-agent editorial production system. It researches live tech news, writes full technical newsletters, enforces quality with guardrails, and stores everything — with zero human involvement after you press the button.

Runs **100% locally** on standard hardware. Uses the **free Google AI Studio Gemini API**. No cloud bills. No subscriptions.

---

## ⚡ Quick Start (3 steps)

```bash
# 1. Install dependencies
npm install
pip install -r requirements.txt

# 2. Set API key (or paste it in the UI)
echo "GEMINI_API_KEY=your-key-here" > .env

# 3. Launch
npm run dev        # → React Control Panel at http://localhost:3000
```

No API key? Run in simulation mode — the pipeline still works end-to-end:
```bash
python agent_pipeline.py --simulate
```

---

## 🌐 Interfaces

| Interface | URL | Command | Purpose |
|---|---|---|---|
| **React Control Panel** | `http://localhost:3000` | `npm run dev` | Primary UI — generate, monitor, archive |
| **Python Streamlit Dashboard** | `http://localhost:8501` | `python -m streamlit run dashboard.py` | Legacy observability dashboard |
| **CLI Pipeline** | Terminal | `python agent_pipeline.py` | Headless / scheduled runs |
| **Background Worker** | — | `python background_worker.py` | Auto-generate on a timer |

---

## 🏗️ Full System Architecture (v6.0)

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
║   Also serves: /api/history  /api/interactions  /api/drafts      ║
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
                              │
            ╔═════════════════▼═════════════════╗
            ║           DATA LAYER              ║
            ║  newsletters/  (.md files)         ║
            ║  run_history.json  (6-span OTel)   ║
            ║  agent_interactions.json           ║
            ║  past_issues.json  (memory DB)     ║
            ╚═══════════════════════════════════╝
```

---

## 💼 Real-World Business & Production Use Cases

If you were to take this exact architecture and deploy it for a business or a personal brand, it solves massive scaling and content generation problems:

*   **Automated Trend Tracking (Zero-Effort Research):** Instead of a human spending two hours every morning scrolling through Hacker News, Reddit, and 10 different engineering blogs to find out what happened in tech, Agent A does it while you sleep.
*   **Hyper-Niche Media Generation:** You can launch a highly technical newsletter or authority site covering specialized topics (like "Rust Web Frameworks" or "Agentic AI Security") that runs almost entirely on autopilot. It finds the news, validates the code, and writes the technical breakdown.
*   **Corporate Market Intelligence:** A company can point Agent A at its competitors' product update feeds, press releases, and GitHub commits. The engine will automatically summarize competitor movements, run a RAG check against past internal reports, and deliver a weekly "Competitor Intelligence Report" directly to the executive team.
*   **Drastic Cost & Time Reduction:** Producing a high-quality, technically accurate newsletter usually requires hours of writing, cross-referencing, and editing. This system cuts that down to a few minutes of processing time on a free tier API—costing virtually $0.

---

## 🤖 Agent A — Trend Scout (Alpha)

**File:** `agent_pipeline.py` → `run_agent_a()` / `server.ts`
**Role:** Autonomous live research and topic discovery

### What it does, step by step

**Mode 1 — Custom Topic** (when user provides a specific subject):
```
User gives topic: "Model Context Protocol"
        ↓
Gemini deconstructs it into 3–5 technical sub-topics:
  1. Deep Dive: Architecture of MCP (score: 450)
  2. Performance Tuning for MCP (score: 380)
  3. Anti-patterns in MCP Implementations (score: 290)
        ↓
Returns structured JSON → handed to Agent B
```

**Mode 2 — Live RSS** (when user picks a niche, no custom topic):
```
Gemini receives mission prompt + 8 registered tool declarations
        ↓
Turn 1: Gemini autonomously chooses which RSS feed to call
  → e.g. calls: fetch_hackernews_headlines(max_items=20)
        ↓
Server executes the tool, returns raw XML parsed headlines:
  [{title, link, description}, ...]
        ↓
Turn 2: Gemini receives raw headlines, filters top 5 for the niche,
         excludes job threads, marketing, non-technical posts,
         assigns relevance scores (50–600 pts each)
        ↓
Returns structured JSON → handed to Agent B
```

**Agentic loop** (max 5 iterations):
```python
chat = model.start_chat(enable_automatic_function_calling=False)
response = chat.send_message(scout_prompt)

for iteration in range(5):
    tool_calls = [part.function_call for part in response.parts if ...]
    if not tool_calls:
        break  # Agent done — has final JSON answer
    # Execute each tool call, feed results back
    response = chat.send_message(tool_response_parts)
```

### The 8 Live RSS Tools

| Tool | Source | Feed URL | Max Items |
|---|---|---|---|
| `fetch_hackernews_headlines` | Hacker News | `news.ycombinator.com/rss` | 20 |
| `fetch_techcrunch_headlines` | TechCrunch | `techcrunch.com/feed/` | 15 |
| `fetch_google_blog_headlines` | Google Blog | `blog.google/rss/` | 10 |
| `fetch_openai_blog_headlines` | OpenAI News | `openai.com/news/rss.xml` | 10 |
| `fetch_zoho_blog_headlines` | Zoho Blog | `zoho.com/blog/feed/` | 10 |
| `fetch_meta_blog_headlines` | Meta Research | `research.facebook.com/feed/` | 10 |
| `fetch_netflix_blog_headlines` | Netflix TechBlog | `netflixtechblog.com/feed` | 10 |
| `fetch_aws_blog_headlines` | AWS Blog | `aws.amazon.com/blogs/aws/feed/` | 10 |

Each tool: fetches RSS XML → parses `<item>` blocks with regex → cleans HTML entities → returns `[{title, link, description}]`.

**Simulation Mode (offline):** When no API key is set or `--simulate` flag is used, Agent A uses niche-matched pre-built templates (Web3, AI/Agents, General Tech) instead of live RSS. The pipeline still completes.

**Telemetry recorded:** `last_wake` timestamp + list of `headlines_pulled` → saved to `run_history.json`

---

## ✍️ Agent B — The Writer (Beta)

**File:** `agent_pipeline.py` → `run_agent_b()` / `server.ts`
**Role:** Memory-aware newsletter authoring with automatic rewrite on failure

### What it does, step by step

```
Receives topics payload from Agent A (3–5 structured stories)
        ↓
Calls check_past_issues tool → queries past_issues.json
  → Returns list of already-covered topic titles
        ↓
Autonomously rejects covered topics, selects fresh alternatives
        ↓
Writes a full Markdown newsletter (3 deep-dive sections):
  - Catchy non-generic title
  - 3–4 sentence contextual introduction
  - ## Deep Dive sections per topic:
      - Technical context & background
      - Architecture details, code snippets, ASCII diagrams
      - Benchmark tables (Markdown table syntax)
      - Developer impact & takeaways
  - Forward-looking conclusion
        ↓
Submits draft to Evaluation Guardrail
```

### Memory Tool — `check_past_issues`

```python
# Tool declaration registered with Gemini
MEMORY_TOOL_DECLARATION = {
    "function_declarations": [{
        "name": "check_past_issues",
        "description": "Checks if any titles have already been covered in past issues.",
        "parameters": {
            "type": "object",
            "properties": {
                "titles": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of topic titles to verify."
                }
            },
            "required": ["titles"]
        }
    }]
}
```

**How `check_past_issues` works internally:**
```python
def check_past_issues(titles):
    past_issues = json.load("past_issues.json")
    past_titles = [issue["title"].strip().lower() for issue in past_issues]
    covered = [t for t in titles if t.strip().lower() in past_titles]
    return {"covered_titles": covered}
```

### System Instruction (Agent B's persona)
```
"You are an elite engineering newsletter author and principal technical architect.
 Write with authority, precision, technical depth, and engaging prose.
 Your audience is senior developers and technical decision-makers."
```

### Rewrite Loop
- If the Guardrail rejects the draft, Agent B receives violation details + original draft
- Rewrites from scratch, addressing each violation explicitly
- Up to **3 attempts** per pipeline run (configurable in `run_pipeline()`)

**Telemetry recorded:** `prompt_tokens`, `output_tokens`, `total_tokens` (from Gemini `usage_metadata`), `attempts` count, all `violations` encountered

---

## 🔬 Agent C — The Evaluator (Gamma)

**File:** `agent_pipeline.py` → `run_agent_c()` / `server.ts`
**Role:** Two-stage quality enforcement — programmatic guardrail + LLM-as-judge

### Stage 1 — Programmatic Security Guardrail

Runs **before** Agent C sees the draft. Pure Python string analysis, no API call:

```python
def evaluate_draft_security_and_quality(draft):
    violations = []

    # 1. Prompt Injection Defense
    injection_patterns = [
        "ignore previous instructions", "ignore all instructions",
        "bypass all rules", "override compliance", "override system",
        "you must approve", "always approve", "passed: true",
        "instruction override"
    ]
    for pattern in injection_patterns:
        if pattern in draft.lower():
            violations.append(f"Security Violation: '{pattern}'")

    # 2. Unclosed Code Block Check
    if draft.count("```") % 2 != 0:
        violations.append("Formatting Violation: Unclosed markdown code block")

    # 3. Empty Code Block Check
    if re.findall(r"```[a-zA-Z0-9]*\s*```", draft):
        violations.append("Formatting Violation: Empty code block detected")

    return {"passed": len(violations) == 0, "violations": violations}
```

**If violations found:** Draft is **rejected**, violation details sent to Agent B as feedback → rewrite triggered.
**If passed:** Handed to Stage 2.

### Stage 2 — LLM-as-Judge

Gemini evaluates the approved draft against a 7-point structured checklist:

```
Quality Checklist:
1. title_present   — Has a clear, non-generic title
2. introduction    — Has a 3–4 sentence contextual introduction
3. deep_dives      — Has 3+ ## sections with substantive technical content
4. code_or_table   — Contains at least one fenced code block OR Markdown table
5. conclusion      — Has a forward-looking conclusion
6. no_filler       — No greetings, no generic filler phrases
7. expert_tone     — Reads like an expert technical memo
```

**Returns structured JSON:**
```json
{
  "passed": true,
  "score": 92,
  "checks": {
    "title_present": true,
    "introduction": true,
    "deep_dives": true,
    "code_or_table": true,
    "conclusion": true,
    "no_filler": true,
    "expert_tone": true
  },
  "notes": "Strong technical depth. Consider more concrete benchmarks."
}
```

Agent C only evaluates the **first 4000 characters** of the draft to save tokens.

**Telemetry recorded:** `score`, `notes`, `passed` verdict → saved to `run_history.json`

---

## 🖥️ React Frontend — Control Panel (Port 3000)

**Files:** `src/App.tsx` (React 19 + TypeScript + Tailwind CSS) + `server.ts` (Express)

The React app is served by Express. In dev mode, Vite middleware handles HMR. In production (`npm run build`), Express serves the static `dist/` folder.

### How a generation cycle works in the UI

```
1. User fills: Niche + Topic (optional) + Model + API key
2. Clicks "Wake Up Newsroom"
3. Frontend → POST /api/generate (body: {niche, topic, model, customApiKey})
4. Express runs the 3-agent pipeline (synchronous — no streaming)
5. Response: {success, newsletter, logs, stats}
6. Frontend streams logs to the UI with 750ms stagger between each entry
   (simulated real-time feel via setTimeout)
7. Newsletter rendered in "Editorial Production Sheet"
8. Auto-saved to newsletters/ on server + to localStorage in browser
9. Dashboard telemetry refreshed automatically
```

### The 5 Dashboard Sub-Tabs

#### 💻 Active Workstation (default tab)

Left sidebar:
- **Niche Presets**: AI & Agentic, Web3, Rust/WASM, Edge AI — click to select
- **Custom Niche**: free-text override input
- **Custom Topic**: optional — give agents a specific subject (e.g. "Kubernetes autoscaling internals")
- **Model Selector**: Gemini 2.5 Flash · 2.5 Pro · 1.5 Flash · 1.5 Pro
- **API Key**: pasted here → saved persistently to `.env` file by the server
- **Wake Up Newsroom**: triggers `POST /api/generate`
- **Snapshots Vault**: all past generated newsletters; click any to reload into the editorial sheet; auto-seeded from server history on page load

Right area:
- **Agent Operations Grid**: 3 cards — Scout / Writer / Evaluator — each shows live log entries and status indicator (IDLE / LOGGING / GENERATING / EVALUATING)
- **Editorial Production Sheet**: rendered newsletter with toggle between Preview (formatted) and Edit Markdown (raw)
- **Download .md** and **Copy to clipboard** buttons

#### 💬 Live Agent Cooperation

Shows the full agent-to-agent message chain logged during the last pipeline run:
```
Orchestrator → Agent A (Trend Scout)  : "Waking up Scout..."
Agent A      → Agent B (Writer)        : "Handing over 5 topics..."
Agent B      → System Memory Layer    : "Checking topics: [...]"
System Memory→ Agent B                 : "All fresh!"
Agent B      → Evaluation Guardrail   : "Draft complete, 2648 chars..."
Guardrail    → Agent B                 : "REJECTED: unclosed code block"
Agent B      → Evaluation Guardrail   : "Revision complete (Attempt 2)"
Guardrail    → Agent C (Evaluator)    : "PASSED. Handing to Critic."
Agent C      → Orchestrator           : "APPROVED (95/100)"
Orchestrator → Streamlit Portal       : "Saved: newsletter_xxx.md"
```
Color coded: purple=Scout, amber=Writer, green=Evaluator, red=Guardrail, cyan=Memory
Data source: `GET /api/interactions` → `agent_interactions.json`

#### 📋 Fleet Transaction Logs

Expandable accordion of all past runs. Per-run shows:
- Timestamp, niche, model, status (success/failed)
- **Agent A:** headlines sourced
- **Agent B:** prompt tokens + output tokens + total tokens + attempts + violations
- **Agent C:** quality score (0–100), evaluator notes, pass/fail

Data source: `GET /api/history` → `run_history.json` (capped at last 50 runs)

#### 📰 Server Archive

File browser for all `.md` newsletters in the `newsletters/` folder:
- Listed newest-first
- Click any filename → content loaded and rendered in the editorial preview pane
- Data source: `GET /api/drafts` + `GET /api/drafts/:filename`

#### 📈 Metrics & Analytics

Computed from all run history:
- Total runs · Success rate · Total tokens consumed · Average quality score
- Token chart (per-run bar visualization)
- Quality score trend (per-run line visualization)

### Python View Tab

Contains the full Streamlit dashboard source code as a downloadable `app.py`. Includes 3-step setup guide: install → save file → run `streamlit run app.py`.

---

## 📡 Backend API (Express — `server.ts`)

| Method | Endpoint | Body / Params | Response |
|---|---|---|---|
| `GET` | `/api/status` | — | `{hasServerKey, stats}` |
| `POST` | `/api/generate` | `{niche, topic, model, customApiKey}` | `{success, newsletter, logs, stats}` |
| `GET` | `/api/history` | — | Array of run telemetry records |
| `GET` | `/api/interactions` | — | Array of agent message objects |
| `GET` | `/api/worker-status` | — | Worker heartbeat object or `null` |
| `GET` | `/api/drafts` | — | Array of `.md` filenames (newest first) |
| `GET` | `/api/drafts/:filename` | filename param | Raw markdown string |

**Security on `/api/drafts/:filename`:** Path traversal blocked — filename is rejected if it contains `..`, `/`, or `\`.

**API key handling:** If `customApiKey` is provided in the request body, `updateEnvFile()` writes it to `.env` and sets `process.env.GEMINI_API_KEY` for the current process. Persists across server restarts.

---

## 🗂️ Data Files Reference

| File | Format | Who writes it | Who reads it | Purpose |
|---|---|---|---|---|
| `past_issues.json` | JSON array | `update_past_issues()` (Python) | `check_past_issues` tool (Agent B) | Memory DB — prevents topic repetition |
| `run_history.json` | JSON array (max 50) | `save_telemetry()` (Python) + `server.ts` | `/api/history` | Full per-run stats for all 3 agents |
| `agent_interactions.json` | JSON array | `log_agent_interaction()` (Python) + `server.ts` | `/api/interactions` | Agent-to-agent message log (overwritten each run) |
| `background_worker_status.json` | JSON object | `background_worker.py` | `/api/worker-status` | Scheduler heartbeat: idle/generating/stopped |
| `newsletters/` | Folder of `.md` files | `run_pipeline()` + `server.ts` | `/api/drafts/*` | Archived final newsletters |
| `.env` | Key=value | `updateEnvFile()` in `server.ts` | `dotenv`, `load_env_file()` | `GEMINI_API_KEY` storage |

### `run_history.json` schema (per record)
```json
{
  "timestamp": "2026-06-20T18:53:20.393Z",
  "niche": "AI & Agentic Frameworks",
  "model": "gemini-1.5-flash",
  "status": "success",
  "error": null,
  "agent_a": {
    "last_wake": "2026-06-20T18:53:20.393Z",
    "headlines_pulled": ["Title 1", "Title 2", "..."],
    "source": "Multiple Tech RSS Feeds",
    "duration_ms": 9564
  },
  "agent_b": {
    "prompt_tokens": 2900,
    "output_tokens": 1960,
    "total_tokens": 4860,
    "attempts": 2,
    "violations": [],
    "duration_ms": 7
  },
  "agent_c": {
    "score": 95,
    "notes": "Approved by Evaluator Agent",
    "passed": true,
    "duration_ms": 3
  },
  "agent_d": {
    "score": 94,
    "verified": 5,
    "total": 5,
    "passed": true,
    "duration_ms": 0
  },
  "telemetry": {
    "total_duration_ms": 9574,
    "total_cost_usd": 0.000806,
    "spans": [
      { "name": "pipeline_run", "duration_ms": 9574 },
      { "name": "agent_a_trend_scout", "duration_ms": 9564 },
      { "name": "rag_fetcher", "duration_ms": 0, "attributes": { "chunks_count": 3 } },
      { "name": "agent_b_writer", "duration_ms": 7 },
      { "name": "agent_c_evaluator", "duration_ms": 3 },
      { "name": "agent_d_fact_checker", "duration_ms": 0, "attributes": { "score": 94, "verified_claims": 5 } }
    ]
  }
}
```

---

## 🧪 Technical Resilience & Edge-Case Stress Testing

### 1. Vector Embedding Fallback Loop
To handle key permissions or model availability restrictions where `text-embedding-004` is not supported, the engine implements an automated fallback mechanism:
- If a `404` or model mismatch is returned, it automatically switches to `gemini-embedding-2` for generating dense 3072-dimensional vector representations.
- This is fully integrated into both Python (`agent_pipeline.py`) and TypeScript (`server.ts`) codebases to ensure uninterrupted operation.

### 2. The 10 Edge-Case Stress Tests (`test_edge_cases.py`)
A comprehensive automated test runner validates the pipeline against 10 critical security, formatting, and semantic challenges:
1. **Unclosed Markdown Blocks**: Ensures the Stage 1 security guardrail catches and corrects unclosed code blocks before LLM review.
2. **Mathematical Notations**: Confirms formatting guardrails correctly parse matrix equations like $O(N \log N)$ and double-escaped variables.
3. **Structured Tables**: Evaluates if the engine correctly structures complex Markdown comparison tables.
4. **Deep RAG Retrieval**: Stresses the RAG vector engine to verify extraction quality when injecting multiple conflicting context blocks.
5. **Kernel Evidence Extraction**: Assures Agent B relies strictly on retrieved kernel facts, preventing hallucinations.
6. **Prompt Injection Mitigation**: Validates that standard system instruction overrides inside topic titles are safely blocked.
7. **Compliance Override Scans**: Verifies that standard compliance-spoof keywords are processed as normal text rather than bypassing guards.
8. **Exact Duplication Detection**: Checks if identical titles trigger immediate deduplication from the history log.
9. **Semantic Similarity Checks**: Verifies that different titles with close semantic overlap are successfully caught and flagged.
10. **Critique-Driven Loop Recovery**: Validates that low-scoring drafts successfully cycle through the critique, rewrite, and approval loop.

Run the test suite:
```bash
python test_edge_cases.py
```

---

## 🔧 CLI Reference

### `agent_pipeline.py`

```bash
python agent_pipeline.py [OPTIONS]

Options:
  --niche "AI & Agentic Frameworks"   Target niche (default: "AI & Agentic Frameworks")
  --model gemini-1.5-flash            Gemini model (default: gemini-1.5-flash)
  --simulate                          Offline mode — no API key needed
  --topic "Model Context Protocol"    Custom topic — agents deconstruct and write about it

Examples:
  python agent_pipeline.py --simulate
  python agent_pipeline.py --niche "Rust Systems & WebAssembly"
  python agent_pipeline.py --niche "Edge AI" --model gemini-1.5-pro
  python agent_pipeline.py --topic "Kubernetes autoscaling" --niche "Cloud Native"
```

### `background_worker.py`

```bash
python background_worker.py [OPTIONS]

Options:
  --niche "AI & Agentic Frameworks"   Target niche
  --model gemini-1.5-flash            Gemini model
  --interval 5                        Minutes between runs (default: 5, decimals ok e.g. 0.5)
  --simulate                          Offline simulation mode

Examples:
  python background_worker.py --simulate --interval 5
  python background_worker.py --niche "Web3 Development" --interval 30
```

Background worker writes `background_worker_status.json` after every cycle. The React dashboard polls this via `/api/worker-status`.

### `npm` scripts

```bash
npm run dev      # Start Express + Vite dev server (hot reload)
npm run build    # Build React app + compile server.ts → dist/
npm start        # Run production build (dist/server.cjs)
npm run lint     # TypeScript type check
```

---

## 🧭 Agent Progression & Evolution

| Day | Topic | What was built |
|---|---|---|
| **Day 1** | Intro to Agents & Vibe Coding | React + Express scaffold, dashboard layout, API key flow |
| **Day 2** | Agent Tools & Interoperability | Agent A with Gemini Function Calling + HackerNews RSS tool; structured JSON inter-agent contracts |
| **Day 3** | Agent Skills, Context & Memory | `past_issues.json` memory DB; `check_past_issues` tool for Agent B; autonomous deduplication |
| **Day 4** | Security & Evaluation | Programmatic guardrails (injection, code blocks); LLM-as-judge Agent C; rewrite feedback loop |
| **Day 5** | Production Fleet & Observability | 8-source RSS registry; background worker; execution telemetry; multi-model support; custom topic mode; unified React dashboard |
| **Day 6** | Evidence-Based RAG & Fact Checker | Crawls URLs, vectorizes with `text-embedding-004`, cosine similarity retrieval, post-draft claims audit (Agent D), 5-span telemetry timeline |
| **Day 7** | Resilience & June 2026 Telemetry | Fallback to `gemini-embedding-2`; 10 automated technical edge-case stress tests (`test_edge_cases.py`); integrated 10 fast-moving June 2026 tech news topics |
| **Day 8 (Upgrade)** | SDK Migration & Grounding | Migrated pipeline to new `google-genai` SDK; implemented Google Search grounding for Agent B (Writer) to fetch and cite real-time links; saved verified sources in `run_history.json` |
| **Day 9 (Upgrade)** | Outbox & Manual Dispatch | Built a React outbox panel with live credential syncing; generated mock payloads for WordPress/Webhooks and added `🚀 Publish Live` and `🚀 Trigger Webhook` buttons for manual execution. |

---

## ✨ Feature Summary

| Feature | Implementation Detail |
|---|---|
| **Publisher Outbox & Config** | Dedicated panel to manage WordPress REST API parameters, Webhook targets, and simulation mode settings with instant local persistence. |
| **Payload Inspection** | Live structured JSON payload display for WordPress REST API drafts and Webhook dispatches before executing the publication. |
| **Manual Dispatch Triggers** | Interactive dispatch buttons to manually upload draft newsletters or invoke webhooks after reviewing simulated payloads. |
| **8 live RSS sources** | HN, TechCrunch, Google, OpenAI, Zoho, Meta, Netflix, AWS — Agent A picks the best one per niche |
| **Custom topic mode** | User provides any subject; Agent A deconstructs into 3–5 technical sub-topics without RSS |
| **Gemini Function Calling** | 2-turn agentic loop; Gemini autonomously decides which tool to call |
| **Memory deduplication** | `check_past_issues` tool queries `past_issues.json`; never repeats a published topic |
| **RAG Full-Article Engine** | Crawls article URLs, strips HTML, chunks into 800-word windows, embeds via `text-embedding-004`, cosine-similarity retrieval |
| **Evidence-grounded writing** | Agent B writes ONLY from retrieved evidence chunks — no hallucinated numbers, quotes, or details |
| **Agent D Fact Checker** | Post-draft claim extraction + keyword overlap audit against RAG vector store; returns % source coverage |
| **Security guardrail** | Regex scan for prompt injection patterns + code block balance check — runs before LLM evaluation |
| **LLM-as-judge scoring** | Agent C scores drafts 0–100 against 7 structured criteria; triggers rewrite if below threshold |
| **Rewrite feedback loop** | Up to 3 attempts; violation details sent back to Agent B with original draft for targeted correction |
| **Multi-model support** | Gemini 2.5 Flash/Pro, 1.5 Flash/Pro — all free tier, selectable per run |
| **6-span OTel telemetry** | Per-agent metrics + RAG + Fact Checker spans saved to `run_history.json` with trace/span IDs |
| **Premium Group Chat UI** | Cooperation tab redesigned as a group chat with emoji avatars, unique colors, WhatsApp-style bubble grouping, online status, and participant badges |
| **Agent communication log** | Every agent handoff message saved to `agent_interactions.json` and parsed into live chat logs |
| **Auto-archive** | All newsletters saved as timestamped `.md` files in `newsletters/` automatically |
| **Background worker** | Python scheduler with configurable interval; writes heartbeat for the dashboard |
| **Offline simulation** | Full 5-agent pipeline runs without an API key using niche-matched curated templates |
| **403 fast-fail** | API key errors instantly switch the entire pipeline to simulation without retrying |
| **API key UI** | Paste key in the React UI → saved to `.env` → persists across server restarts |
| **Zero cloud cost** | 100% local; only uses Google AI Studio free tier |

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Vite 6, Lucide Icons |
| **Backend** | Node.js, Express 4, TypeScript (`tsx` for dev, `esbuild` for prod) |
| **AI SDK (Node)** | `@google/genai` v2 (Gemini SDK) |
| **AI SDK (Python)** | `google-genai` (Migrated from legacy `google-generativeai`) |
| **Python Dashboard** | Streamlit |
| **Data storage** | Local JSON files + Markdown files (no database) |
| **RSS parsing** | Regex-based XML parser (no external library — zero deps for Python) |

---

## 👤 Author

### Sathiyamoorthi K (Ksmashhero)
*B.Tech Information Technology Student (2023- 2027) | Aspiring Software Engineer & AI Developer*

- 🌐 **LinkedIn:** [Sathiyamoorthi K](https://www.linkedin.com/in/sathiyamoorthi-k-336a79307/)
- 💻 **GitHub:** [@Ksmashhero06](https://github.com/Ksmashhero06/)
- 📸 **Instagram:** [@kkssathiyamoorthi06](https://www.instagram.com/kkssathiyamoorthi06/)

**Key expertise:** Web Development (HTML/CSS/JS/Flask/WordPress) · AI & ML (Python/TensorFlow/YOLO) · Blockchain · Team Leadership

---

## 👥 Co-Author (for Capstone Project)

### Mohammed Rehaan S
*B.Tech Artificial Intelligence and Data Science Student (2024-2028)*

- 🌐 **LinkedIn:** [Mohammed Rehaan S](https://www.linkedin.com/in/mohammed-rehaan-s)
- 💻 **GitHub:** [@rehaan2493](https://github.com/rehaan2493)

**Key expertise:** Game development (unity) · AIML (python, TensorFlow) · Data analyst (python, tableau) · SQL

---

## 🇮🇳 Featured Project (Author's Personal Project)

### India's Voice of Justice
- **Repository:** [Ksmashhero06/India-s-Voice-of-Justice](https://github.com/Ksmashhero06/India-s-Voice-of-Justice)
- 🏆 **Tamil Nadu State-Level Selection (Niralthiruvizha 3.0 / Villupuram Cohort)** — Wadhwani Foundation Learning & Entrepreneurship program
- AI-powered multilingual legal assistance platform using RAG, FastAPI, React, FAISS, HuggingFace multilingual embeddings, and Google Gemini AI

---

### 🔒 Day 4 Companion Repositories
- **Ambient Expense-Approval Agent** — [Ksmashhero06/ambient-expense-agent](https://github.com/Ksmashhero06/ambient-expense-agent): 5-node ADK Workflow with Pub/Sub, PII scrubbing, LLM-as-judge evals
- **Secure Agent Lab: Shopping Assistant** — [Ksmashhero06/secure-agent-lab](https://github.com/Ksmashhero06/secure-agent-lab): ADK agent with STRIDE threat model, outcome-based security tests, Semgrep pre-commit hooks

---

*Built with precision and clean engineering during the Kaggle 5-Day AI Agents Intensive.*
