# Kaggle Writeup — Vibecoding Agents Capstone Project

---

## FORM FIELDS (copy-paste directly)

### Title (max 80 chars)
```
Autonomous Vibe Newsletter Engine — 3-Agent Live Tech News Publisher
```

### Subtitle (max 140 chars)
```
A multi-agent AI fleet that researches live tech news, writes newsletters, enforces quality, and archives everything — zero human input.
```

### Submission Track
**→ Agents for Business**

*Rationale: Automates the full editorial pipeline (research → write → review → publish → archive) that normally requires hours of manual work per newsletter cycle. Clear ROI: replaces 3–5 hours of editorial work per issue with zero cost.*

---

## PROJECT DESCRIPTION (paste into the rich text editor)

# Autonomous Vibe Newsletter Engine

> A production-grade, 3-agent AI fleet that researches live developer news, writes full technical newsletters, enforces quality with guardrails, and archives everything — with zero human involvement after you press the button.

**GitHub:** https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine
**Track:** Agents for Business

---

## The Problem

Technical newsletter teams face a recurring, expensive challenge: every edition requires **hours of manual work** — scanning dozens of RSS feeds, selecting relevant stories, writing deep-dive prose, checking formatting errors, and archiving output. For solo developers and small teams, this is unsustainable at scale.

I set out to answer: *Can a fleet of specialized AI agents fully replace this editorial workflow — from live internet research to final published draft — with a quality bar high enough for production?*

---

## The Solution

The **Autonomous Vibe Newsletter Engine** handles every stage of the editorial cycle autonomously:

1. **Agent A (Trend Scout)** — researches live tech news from 8 real RSS feeds using Gemini Function Calling
2. **Agent B (The Writer)** — writes a full Markdown newsletter, checking long-term memory to never repeat covered topics
3. **Agent C (The Evaluator)** — enforces quality with programmatic security guardrails + LLM-as-judge scoring

Runs locally at **zero cloud cost** using the free Google AI Studio Gemini API.

---

## Architecture

```
REACT CONTROL PANEL (localhost:3000)
Niche · Topic · Model · API Key · Wake Up Newsroom Button
Tabs: Workstation | Cooperation | Logs | Archive | Analytics
                    |
                    | POST /api/generate
                    v
                    EXPRESS SERVER (server.ts)
Orchestrates pipeline · Saves telemetry · Serves telemetry APIs
                    |
       +------------+------------+
       |            |            |
   AGENT A      AGENT B      AGENT C
 Scout Agent    Writer Agent Evaluator Agent
  8 RSS Tools  Memory Tool   Guardrail
  Gemini FC    past_issues   LLM-Judge
       |            |            |
       +------------+------------+
                    |
         newsletters/   run_history.json   agent_interactions.json
```

---

## The Three Agents

### Agent A — Trend Scout

Equipped with **8 live RSS tool declarations** registered with Gemini Function Calling. Runs a 2-turn agentic loop:

- **Turn 1:** Gemini picks which RSS feed matches the niche and autonomously calls the tool
- **Tool Execution:** Server fetches live XML, parses it, returns structured headlines
- **Turn 2:** Gemini filters top 5 most technically relevant stories, assigns engagement scores, returns JSON

**Live RSS Sources:**

| Tool | Source |
|---|---|
| `fetch_hackernews_headlines` | Hacker News |
| `fetch_techcrunch_headlines` | TechCrunch |
| `fetch_google_blog_headlines` | Google Blog |
| `fetch_openai_blog_headlines` | OpenAI News |
| `fetch_meta_blog_headlines` | Meta Research |
| `fetch_netflix_blog_headlines` | Netflix TechBlog |
| `fetch_aws_blog_headlines` | AWS Blog |
| `fetch_zoho_blog_headlines` | Zoho Blog |

Also supports **Custom Topic Mode** — user provides a subject, Agent A deconstructs it into 3–5 technical sub-topics without RSS.

Agentic loop implementation:
```python
chat = model.start_chat(enable_automatic_function_calling=False)
response = chat.send_message(scout_prompt)

for iteration in range(5):  # max 5 iterations
    tool_calls = [p.function_call for p in response.parts if p.function_call.name]
    if not tool_calls:
        break  # Agent has final JSON answer
    tool_response_parts = []
    for fc in tool_calls:
        result = dispatch_tool(fc.name, dict(fc.args))
        tool_response_parts.append(FunctionResponse(name=fc.name, response=result))
    response = chat.send_message(tool_response_parts)
```

### Agent B — The Writer

Equipped with the **`check_past_issues` memory skill** backed by `past_issues.json`:

1. Calls `check_past_issues` with all candidate topics
2. Autonomously rejects already-covered titles
3. Selects fresh alternatives
4. Writes full newsletter: title + intro + 3 deep-dive sections (with code/tables) + conclusion

On failure, receives violation details + original draft and **rewrites from scratch** (up to 3 attempts).

Memory tool schema:
```json
{
  "name": "check_past_issues",
  "description": "Checks if any titles were already covered in past newsletter issues.",
  "parameters": {
    "type": "object",
    "properties": {
      "titles": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["titles"]
  }
}
```

### Agent C — The Evaluator

Runs a **two-stage evaluation**:

**Stage 1 — Programmatic Security Guardrail** (pure Python, no API call):
```python
injection_patterns = [
    "ignore previous instructions", "bypass all rules",
    "override compliance", "you must approve", ...
]
for pattern in injection_patterns:
    if pattern in draft.lower():
        violations.append(f"Security Violation: '{pattern}'")

if draft.count("```") % 2 != 0:
    violations.append("Unclosed markdown code block")
```

**Stage 2 — LLM-as-Judge** (Gemini evaluates against 7-point checklist):
1. Clear non-generic title
2. 3–4 sentence contextual introduction
3. 3+ deep-dive sections with technical content
4. At least one code block OR Markdown table
5. Forward-looking conclusion
6. No filler phrases
7. Expert technical tone

Returns `{"passed": true, "score": 92, "checks": {...}, "notes": "..."}` — score below threshold triggers rewrite.

---

## Frontend: React Control Panel

React 19 + TypeScript + Tailwind CSS SPA served by Express. Five real-time dashboard sub-tabs:

| Tab | Data Source | Content |
|---|---|---|
| Active Workstation | localStorage + APIs | Niche picker, agent cards, newsletter preview |
| Live Agent Cooperation | `/api/interactions` | Color-coded agent message feed |
| Fleet Transaction Logs | `/api/history` | Per-run accordion with token/score stats |
| Server Archive | `/api/drafts` | Browse and read all archived newsletters |
| Metrics & Analytics | computed | Token trends, quality score charts |

---

## Key Concepts Demonstrated

### 1. Multi-Agent System (Code)
Three specialized agents with distinct tools, personas, and agentic loops. All communicate via structured JSON contracts. Orchestrator pattern in `server.ts` coordinates sequential handoffs with telemetry at every stage.

### 2. Agent Skills (Code)
- **Memory Skill (`check_past_issues`):** Persistent `past_issues.json` database. Agent B autonomously queries it before writing. Approved topics appended post-publication. Never repeats content.
- **Live RSS Skill:** 8 independently declared tool functions, each fetching a specific tech publication's RSS feed using Python stdlib only (zero external dependencies).

### 3. Security Features (Code)
- Prompt injection defense: 9 injection pattern strings scanned in every draft
- Code block structural validation: odd backtick count = formatting failure
- Path traversal protection on `/api/drafts/:filename`
- API key isolation: stored in `.env`, never logged or returned in API responses

### 4. Deployability
- Production build: `npm run build` compiles React + TypeScript → `dist/`
- Background worker (`background_worker.py`): configurable interval scheduler for fully autonomous generation
- Environment-based configuration via `.env`

---

## Repository Structure

```
├── server.ts              # Express backend + pipeline orchestrator
├── src/App.tsx            # React SPA — 5-tab dashboard
├── agent_pipeline.py      # Python CLI pipeline (all 3 agents)
├── background_worker.py   # Python scheduler (auto-generate on timer)
├── dashboard.py           # Streamlit dashboard
├── newsletters/           # Auto-archived .md newsletters
├── run_history.json       # Execution telemetry (last 50 runs)
├── agent_interactions.json# Agent message log (last run)
└── past_issues.json       # Memory DB — all published topics
```

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

No API key? `python agent_pipeline.py --simulate`

---

## Results

From live runs in `run_history.json`:
- **23+ newsletters archived** across all niches
- **Average quality score: 92/100** (LLM-as-judge)
- **7/7 compliance checks passed** on approved runs
- **Rewrite loop triggered in ~30% of runs** — formatting issues caught and autonomously corrected
- **Supported models:** Gemini 2.5 Flash, 2.5 Pro, 1.5 Flash, 1.5 Pro (all free tier)

---

## 5-Day Journey

| Day | Topic | What I Built |
|---|---|---|
| Day 1 | Agents & Vibe Coding | React + Express scaffold, design system |
| Day 2 | Tools & Interoperability | Agent A + Gemini Function Calling + HN RSS tool |
| Day 3 | Skills, Context & Memory | Memory DB, `check_past_issues` skill |
| Day 4 | Security & Evaluation | Guardrails, LLM-as-judge, rewrite loop |
| Day 5 | Production Fleet | 8 RSS sources, background worker, telemetry, unified React dashboard |

---

## Business Value

- **Time saved:** 3–5 hours of editorial work per newsletter → fully automated
- **Cost:** $0 — Google AI Studio free tier only
- **Quality:** Guardrails catch formatting and security issues autonomously
- **Memory:** Never repeats a topic — maintains editorial freshness automatically
- **Scale:** Background worker runs on any schedule, generates while you sleep

---

*Built during the Kaggle 5-Day AI Agents Intensive Course.*
*GitHub: https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine*

---

## PROJECT LINKS (add to the Links section)

- GitHub: https://github.com/Ksmashhero06/autonomous-vibe-newsletter-engine
- LinkedIn: https://www.linkedin.com/in/sathiyamoorthi-k-336a79307/

---

## VIDEO SCRIPT OUTLINE (YouTube, max 5 min)

**[0:00–0:30] The Problem**
Show a manual newsletter workflow. Too slow. Too expensive. Needs agents.

**[0:30–1:30] Architecture Overview**
Walk through the architecture diagram: React → Express → Agent A → Agent B → Agent C → Archive.

**[1:30–3:30] Live Demo**
- Open http://localhost:3000
- Select "AI & Agentic Frameworks" niche
- Click "Wake Up Newsroom"
- Watch live agent logs stream in (Scout → Writer → Guardrail → Evaluator)
- Newsletter appears in editorial sheet
- Switch to "Live Agent Cooperation" tab — show the full message chain
- Switch to "Server Archive" — show 23+ newsletters saved

**[3:30–4:30] Key Concepts**
- Code: Gemini Function Calling agentic loop in agent_pipeline.py
- Code: `check_past_issues` memory skill
- Code: Guardrail security scan
- Video: React dashboard + 5 sub-tabs

**[4:30–5:00] Business Value + Wrap Up**
- 23+ newsletters, avg score 92/100, $0 cost, runs on any schedule
- GitHub link

## THUMBNAIL
560 × 280px — Screenshot of the React dashboard showing all 3 agent cards + newsletter draft rendered.
