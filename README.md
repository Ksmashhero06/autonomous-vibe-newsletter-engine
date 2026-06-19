# The Autonomous Vibe Newsletter Engine 🤖📰

An elegant, multi-agent editorial production engine built during the Kaggle intensive course: **"5-Day AI Agents: Intensive Vibe Coding Course With Google"**. This engine automates technical trend research, copywriting, and quality evaluation to produce pristine, structured Markdown newsletters.

Designed for robust self-hosted local execution, this system bypasses heavy cloud bills and complex cloud infrastructure by running **100% locally on standard hardware** using the free **Google AI Studio Gemini API**.

---

## 📚 What’s being covered?
- **Day 1: Introduction to Agents & Vibe Coding**: Level up from AI chatbots and text completion to autonomous agents. Master vibe coding workflows where natural language is the primary programming interface.
- **Day 2: Agent Tools & Interoperability**: Explore unlimited capabilities by integrating external APIs, code execution, and agent to agent communication.
- **Day 3: Agent Skills**: Build personalized agents with long-term memory and state. Master strategies for long context and optimal token use and building skills with agents to integrate into agentic frameworks.
- **Day 4: Vibe Coding Agent Security and Evaluation**: Develop reliable agents by implementing rigorous testing, guardrails, and quality evaluations. Secure agents against new threat vectors.
- **Day 5: Spec-Driven Production Grade Development in the Age of Vibe Coding**: Graduate your local agents into a governed, scalable, and observable production-ready fleet. Master cloud deployment, debugging, and observability.

---

## 🌟 Visual & Aesthetic Identity

Moving away from the overdone black-and-neon "hacker matrix" theme, this engine features a **Classic Trust-Centered Enterprise Palette**:
- **White & Soft-Slate Canvas**: A clean, readable interface that mirrors high-level executive dashboards.
- **Royal Blue Accents (`#1D63ED`)**: Reflects professional clarity and structured corporate design.
- **Strict Layout Negative Space**: Emphasizes spacious readability and clear structural hierarchies to facilitate professional review.

---

## 🧭 5-Day Agent Progression Roadmap

This repository tracks my progressive journey from conceptualizing user intent to orchestrating specialized background agentic fleets.

- [x] **Day 1: Interface Setup & Sandboxed Groundwork**
  - Establish the core dashboard layouts, design systems, and developer tools. Set up API integrations.
- [x] **Day 2: The Trend Scout Agent (Alpha)**
  - Equipped Agent A with a live HackerNews RSS tool using Gemini Function Calling. Implemented a 2-turn agentic loop where the model autonomously fetches, filters, and passes real developer trends to Agent B.
- [x] **Day 3: Agent Skills, Context & Memory**
  - Equipped Agent B (Writer) with a memory skill using a local `past_issues.json` database. Agent B calls this tool, autonomously filters and rejects previously covered topics, and selects alternative developer trends from Agent A's list to manage context and tokens.
- [x] **Day 4: The Compliance Critic Agent (Gamma) & Local Evaluations**
  - Implement programmatic evaluation steps, security checkpoint against prompt injections, PII sanitization (SSNs & credit cards), and a local LLM-as-judge evaluation pipeline.
  - Implement automated quality/security rewrite feedback loops in the multi-agent pipeline (`agent_pipeline.py` and `server.ts`).
- [x] **Day 5: Production Fleet Orchestration & Telemetry**
  - Run background loops, generate local markdown archives, compile Streamlit setups, and view complete agent transaction logs.

---

## 🏆 Day 5 Milestone Deliverables: 100% Complete

### 🔭 1. Execution Telemetry Engine (`agent_pipeline.py`)
Instrumented all three agents with a live telemetry tracking system:
- **`execution_telemetry` dict** — global state reset at the start of each `run_pipeline` call, tracking per-run metrics for all three agents.
- **Agent A** — records `last_wake` timestamp and list of `headlines_pulled` from RSS sources.
- **Agent B** — accumulates `prompt_tokens`, `output_tokens`, `total_tokens` (from Gemini `usage_metadata`), `attempts` count, and list of all guardrail `violations` encountered.
- **Agent C** — records `score` (0–100), evaluator `notes`, and `passed` verdict.
- **`save_telemetry()`** — writes each run as a structured JSON record to `run_history.json` (capped at last 50 runs), capturing success/failure status and full agent telemetry.
- **`run_pipeline` updated to v5.0.0** — now wraps execution in a `try/except` to ensure telemetry is always saved even on failures.

### 🤖 2. Background Fleet Worker (`background_worker.py`)
A zero-external-dependency Python scheduler that runs the newsletter pipeline in the background:
- Uses Python's built-in `time` + `threading` modules — no APScheduler or `schedule` required.
- Configurable run interval via `--interval` CLI flag (default: 5 minutes, decimals supported e.g. `0.5`).
- Writes `background_worker_status.json` after each cycle (status: `idle`, `generating`, or `stopped`) for the dashboard to poll.
- Accepts `--niche`, `--model`, `--interval`, `--simulate` CLI arguments.
- Handles pipeline failures gracefully and records errors to `run_history.json`.
- **To run:** `python background_worker.py --simulate --interval 5`

### 📊 3. Local Observability Dashboard (`dashboard.py`)
A full-featured **Streamlit** interactive web dashboard launched at `http://localhost:8501`:
- **Sidebar** — Select niche, model, toggle simulation mode, trigger a Force Manual Run (executes the full pipeline on demand).
- **Background Worker Status** — Polls `background_worker_status.json` to display current state and time to next wakeup.
- **4 Metric Cards** — Last Agent A wakeup time, Total fleet cycles run, Accumulated token count, Compliance success rate.
- **Tab 1: Fleet Transaction Logs** — Expandable run history; each entry shows Agent A headlines, Agent B token stats and violations, Agent C score and notes.
- **Tab 2: Newsletter Archive** — Dropdown file selector to browse and read any saved `.md` draft in the project directory.
- **Tab 3: Token & Quality Metrics** — Line charts tracking token consumption and evaluator score trends over time.
- **To launch:** `python -m streamlit run dashboard.py`

---

## 🏆 Day 4 Milestone Deliverables: 100% Complete

### 🛡️ 1. Newsletter Security Guardrails
Implemented automated quality and security evaluation loop inside the multi-agent pipeline (both python CLI `agent_pipeline.py` and Node/TS dashboard `server.ts`). Detects unclosed/hallucinated code blocks and suspected prompt injection strings, triggering a 3-attempt rewrite/feedback loop with Agent B.


Day 4 deliverables are split into two standalone repositories:

### 🔒 2. Ambient Expense-Approval Agent
An automated expense-routing agent designed using a 5-node ADK Workflow graph featuring a local evaluation loop and Pub/Sub webhook integration.
* **Repository Link:** [Ksmashhero06/ambient-expense-agent](https://github.com/Ksmashhero06/ambient-expense-agent)
* **Webhook Server** (`app/fast_api_app.py`): Serves on port 8080 to handle incoming Pub/Sub push messages and run agent workflows asynchronously.
* **Security Checkpoint** (`expense_agent/`): Automatically detects and scrubs sensitive PII (SSNs & credit cards) and filters out prompt injection attacks.
* **Evaluation Pipeline** (`tests/eval/`): Includes synthetic datasets, a trace generator, and a local LLM-as-judge grader.

### 🛒 3. Secure Agent Lab: Shopping Assistant
A secure shopping assistant agent built with Google Agent Development Kit (ADK) featuring outcome-based security testing and automated commit gating.
* **Repository Link:** [Ksmashhero06/secure-agent-lab](https://github.com/Ksmashhero06/secure-agent-lab)
* **Agent logic (`app/agent.py`):** Features stateful tools to manage cart checkouts, redeem discount codes, award loyalty points, and update coupon activation states.
* **STRIDE Threat Model (`threat_model.md`):** Complete mapping of trust boundaries, entrypoints, threat vectors, and mitigations.
* **Security Tests (`tests/test_agent.py`):** High-coverage outcome-based unit tests verifying parameter checks, access boundaries, and discount state validation.
* **Secret Leak Prevention:** Git pre-commit hooks configured with Semgrep rules that intercept and block commits containing hardcoded Google API credentials.

---


## 🏆 Day 1 Milestone deliverables: 100% Complete

### 📚 Theory & System Conceptualization
- **Unit 1 Summary Podcast**: Analyzed the foundational mechanisms of agentic workflows and their application to real-world industrial tasks.
- **"The New SDLC with Vibe Coding" Whitepaper**: Studied the shift from manual code assembly to high-level intent-driven "vibe coding." Explored the transition of the developer's role from writing line-by-line syntax to managing an agentic "factory model" of modular worker units.

### 🛠️ Hands-On Labs & Sandboxed Deployments
- **Lab 1: "Get started with Antigravity 2.0 and IDE"**: Successfully initialized the workspace environment and integrated the AI developer harness.
- **Lab 2: "Build a Web Application in AI Studio and Deploy to Cloud Run"**: Developed a server-side proxied web portal and deployed it to Google Cloud's sandbox container system.

---

## 🏆 Day 2 Milestone Deliverables: 100% Complete

### 🔧 Agent Tools & Interoperability

- **Live HackerNews RSS Tool** (`fetchHackerNewsHeadlines`): A real-time data tool that fetches and parses the top stories from `https://news.ycombinator.com/rss`. Registered as a callable function for Agent A via Gemini's Function Calling API.
- **Gemini Function Calling — 2-Turn Agentic Loop**:
  - **Turn 1**: Agent A receives its mission prompt and autonomously decides to call `fetch_hackernews_headlines`.
  - **Tool Execution**: The server fetches live RSS XML, parses it, and returns a structured headlines array.
  - **Turn 2**: The live data is fed back to Agent A, which filters the top 5 most technically relevant stories for the target niche and returns structured JSON.
  - **Handoff**: The filtered payload is passed directly to Agent B (The Writer) as the inter-agent message contract.
- **Niche-Aware Filtering**: Agent A intelligently excludes job postings, "Ask HN" threads, and non-technical opinion pieces, surfacing only high-signal engineering stories.
- **Graceful Fallback**: If the live tool fails or no API key is configured, the pipeline falls back to curated niche-matched simulation templates.

### 🐍 Python Multi-Agent Pipeline (`agent_pipeline.py`)
A fully standalone Python implementation of the complete Day 2 architecture:
- **Agent A** uses `google-generativeai` function declarations and a multi-turn chat loop with automatic tool dispatch.
- **Agent B** receives Agent A's JSON payload and generates a full Markdown newsletter.
- **Agent C** audits the draft against a structured quality checklist and stamps the final output.
- Saves the stamped newsletter as a timestamped `.md` file locally.

```bash
# Install dependency
pip install google-generativeai

# Run the full pipeline
python agent_pipeline.py
python agent_pipeline.py --niche "Rust Systems & WebAssembly"
python agent_pipeline.py --niche "Edge AI & Distributed Compute" --model gemini-1.5-pro
```

### 🏗️ Updated Architecture (Day 2)

```
[ Developer Input / Niche Select ]
                │
                ▼
   ┌──────────────────────────────────┐
   │  Alpha — Trend Scout             │
   │  Tool: fetch_hackernews_headlines │
   │  ┌──────────────────────────┐    │
   │  │ Turn 1: Agent calls tool │    │
   │  │ Tool : RSS fetch (live)  │    │
   │  │ Turn 2: Agent filters    │    │
   │  └──────────────────────────┘    │
   └──────────────┬───────────────────┘
                  │ Structured JSON (top 5 stories)
                  ▼
   ┌──────────────────────────────────┐
   │  Beta — Copywriter               │
   │  Converts payload into pristine  │
   │  Markdown newsletter prose       │
   └──────────────┬───────────────────┘
                  │ Markdown Draft
                  ▼
   ┌──────────────────────────────────┐
   │  Gamma — Compliance Critic       │
   │  Audits style, structure & tone  │
   │  Stamps verified release         │
   └──────────────┬───────────────────┘
                  │ Approved Newsletter
                  ▼
        [ Stamped Markdown Output ]
```

---

## 🏆 Day 3 Milestone Deliverables: 100% Complete

### 🧠 Agent Memory & Local JSON State
- **Persistent Local Memory Database** (`past_issues.json`): A lightweight JSON store containing all topics that have been previously written about and published in the newsletter.
- **Memory Check Skill** (`check_past_issues`): A tool registered for Agent B (`Writer`) that takes candidate story titles and checks them against the database.
- **Autonomous Duplication Filtering**:
  - Before drafting a new edition, Agent B calls `check_past_issues` with all 5 trending stories sourced by Agent A.
  - If a story has already been covered, Agent B autonomously rejects it, logs the rejection trace in the pipeline activity, and selects alternative uncovered stories to form the final 3 deep-dives.
- **Post-Generation Persistence**: When the newsletter is approved, the pipeline automatically parses the selected stories and appends them to `past_issues.json` with a timestamp and niche tag.

---

## 🏗️ Multi-Agent Architecture

```
[ Developer Input / Niche Select ]
                │
                ▼
   ┌─────────────────────────┐
   │  Alpha - Trend Scout    │ ──► Gathers HackerNews, GitHub, and Tech RSS feeds
   └────────────┬────────────┘
                │ Raw Inputs
                ▼
   ┌─────────────────────────┐
   │  Beta - Copywriter      │ ──► Structures into elegant, high-impact prose
   └────────────┬────────────┘
                │ Draft Output
                ▼
   ┌─────────────────────────┐
   │  Gamma - Compliance     │ ──► Programmatically audits style sheet, stamps verifications
   └────────────┬────────────┘
                │ Stamped Release
                ▼
[ Stamped Newsletter / Markdown ]
```

---

## ⚡ Quick Start: Local Installation

Run the entire multi-agent engine locally on your machine for $0.00 using your free Google AI Studio developer keys.

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/autonomous-vibe-newsletter-engine.git
cd autonomous-vibe-newsletter-engine
```

### 2. Configure Virtual Environment & Install Dependencies
Create a virtual environment and load the open-source Python packages:
```bash
# Create environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install requirements
pip install streamlit google-generativeai
```

### 3. Load Your Free Gemini API Key
Export your key to your local environment. Grab a free key from the [Google AI Studio Console](https://aistudio.google.com/).
```bash
# On Linux/macOS
export GEMINI_API_KEY="your-api-key-here"

# On Windows (PowerShell)
$env:GEMINI_API_KEY="your-api-key-here"

# On Windows (Command Prompt)
set GEMINI_API_KEY=your-api-key-here
```

### 4. Launches the Dashboard
Run the custom Streamlit control panel to trigger the agent pipeline on your device:
```bash
streamlit run app.py
```

---

## ✨ System Features
- **Zero-Cost Telemetry**: Saves background run traces to simple local `.txt` or `.json` logs, keeping records secure and accessible.
- **Off-Grid Persistence**: Uses raw local filesystem scripts to cache generated newsletters rather than requiring paid Cloud Databases.
- **Instant Exporters**: Download beautifully generated Markdown drafts directly from the Streamlit UI.
- **Live Tool Use** *(Day 2)*: Agent A uses Gemini Function Calling to autonomously invoke a real HackerNews RSS scraper — no simulated data when a key is configured.
- **Inter-Agent Messaging** *(Day 2)*: Agents communicate via structured JSON contracts, making the pipeline modular and each agent independently swappable.
- **Graceful Degradation** *(Day 2)*: Full offline simulation mode activates automatically when no API key is present, keeping the dashboard always functional.

---
*Created in participation of the Kaggle 5-Day AI Agents Intensive. Built with precision, intent, and clean user experience.*

---

## 👤 Author & Featured Projects

### Sathiyamoorthi K (Ksmashhero)
*B.Tech Information Technology Student (2027 Batch) | Aspiring Software Engineer & AI Developer*

*   🌐 **LinkedIn:** [Sathiyamoorthi K](https://www.linkedin.com/in/sathiyamoorthi-k-336a79307/)
*   💻 **GitHub:** [@Ksmashhero06](https://github.com/Ksmashhero06/)
*   📸 **Instagram:** [@kkssathiyamoorthi06](https://www.instagram.com/kkssathiyamoorthi06/)

#### Key Areas of Expertise:
*   💻 **Web Development** – WordPress, Elementor, HTML, CSS, JavaScript, Flask
*   🤖 **AI & Machine Learning** – Python, scikit-learn, OpenCV, TensorFlow, YOLO
*   🔗 **Blockchain Development** – Academic projects involving blockchain-based record management systems
*   👥 **Team Leadership** – Experience as Squad Leader/Assistant Squad Leader during internships, mentoring interns and coordinating tasks
*   🚀 **Project Development** – SmartCattle, Annual Report Management System, Dictionary Apps, and academic solutions

---

### 🇮🇳 Featured Project: India's Voice of Justice
*   **Repository Link:** [Ksmashhero06/India-s-Voice-of-Justice](https://github.com/Ksmashhero06/India-s-Voice-of-Justice)
*   🏆 **Tamil Nadu State-Level Selection (Niralthiruvizha 3.0 / Villupuram Cohort)**: Selected and enrolled in the Wadhwani Foundation Learning & Entrepreneurship program.
*   **Overview:** An AI-powered multilingual legal assistance platform designed to simplify access to legal information for Indian citizens. Uses Retrieval-Augmented Generation (RAG), FastAPI, React, FAISS vector search, HuggingFace multilingual embeddings, and Google Gemini AI to provide structured legal guidance, complaint drafting, and legal awareness in multiple Indian languages.
