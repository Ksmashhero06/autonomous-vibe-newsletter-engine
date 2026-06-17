# The Autonomous Vibe Newsletter Engine 🤖📰

An elegant, multi-agent editorial production engine built during the Kaggle intensive course: **"5-Day AI Agents: Intensive Vibe Coding Course With Google"**. This engine automates technical trend research, copywriting, and quality evaluation to produce pristine, structured Markdown newsletters.

Designed for robust self-hosted local execution, this system bypasses heavy cloud bills and complex cloud infrastructure by running **100% locally on standard hardware** using the free **Google AI Studio Gemini API**.

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
- [ ] **Day 4: The Compliance Critic Agent (Gamma)**
  - Implement programmatic evaluation steps, stylistic constraints, and compliance checks (avoiding buzzwords, checking formatting).
- [ ] **Day 5: Production Fleet Orchestration & Telemetry**
  - Run background loops, generate local markdown archives, compile Streamlit setups, and view complete agent transaction logs.

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
