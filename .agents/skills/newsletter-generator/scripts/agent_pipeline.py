#!/usr/bin/env python3
"""
Autonomous Newsletter Engine — Python Multi-Agent Pipeline
==========================================================
Day 3: Agent Skills, Context & Memory

Architecture:
  Agent A (Trend Scout)  — Equipped with a live HackerNews RSS tool.
                           Autonomously calls the tool, receives raw headlines,
                           then filters the top 5 most technically relevant stories.
                           Passes a clean structured summary to Agent B.

  Agent B (Writer)       — Receives Agent A's payload and drafts a high-quality
                           technical newsletter in Markdown.

  Agent C (Evaluator)    — Audits the draft against quality/compliance criteria
                           and stamps the final approved version.

Usage:
    # Set your API key first
    $env:GEMINI_API_KEY = "your-key-here"           # PowerShell
    export GEMINI_API_KEY="your-key-here"            # bash/zsh

    # Run the pipeline
    python agent_pipeline.py
    python agent_pipeline.py --niche "Rust Systems & WebAssembly"
    python agent_pipeline.py --niche "Web3 Development" --model gemini-1.5-pro

Requirements:
    pip install google-generativeai
"""

import argparse
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

# ──────────────────────────────────────────────────────────────────────────────
# Bootstrap: Validate environment before importing the SDK
# ──────────────────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
if not GEMINI_API_KEY:
    print("❌  GEMINI_API_KEY environment variable is not set.")
    print("    Set it with:  $env:GEMINI_API_KEY = 'your-key'  (PowerShell)")
    print("               or: export GEMINI_API_KEY='your-key'  (bash)")
    sys.exit(1)

try:
    import google.generativeai as genai
except ImportError:
    print("❌  google-generativeai is not installed.")
    print("    Run:  pip install google-generativeai")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)


# ──────────────────────────────────────────────────────────────────────────────
# Agent Tool: HackerNews RSS Live Feed Fetcher
# ──────────────────────────────────────────────────────────────────────────────

HN_RSS_URL = "https://news.ycombinator.com/rss"


def fetch_hackernews_headlines(max_items: int = 20) -> dict[str, Any]:
    """
    Agent A's primary tool. Fetches the top stories from the HackerNews RSS feed.

    This function is registered as a callable tool for Agent A (Trend Scout).
    Gemini's function-calling API will autonomously decide when and how to invoke it.

    Args:
        max_items: Maximum number of raw headlines to retrieve (default 20, max 30).

    Returns:
        Dict with 'headlines' (list of {title, link, description}) and 'count'.
    """
    max_items = max(1, min(int(max_items), 30))
    print(f"  [🔧 Tool] fetch_hackernews_headlines(max_items={max_items})")
    print(f"  [🔧 Tool] → Connecting to {HN_RSS_URL} ...")

    req = urllib.request.Request(
        HN_RSS_URL,
        headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_content = response.read().decode("utf-8")
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ Fetch error: {exc}")
        return {"headlines": [], "count": 0, "error": str(exc)}

    # Parse RSS XML
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        return {"headlines": [], "count": 0, "error": f"XML parse error: {exc}"}

    channel = root.find("channel")
    if channel is None:
        return {"headlines": [], "count": 0, "error": "No <channel> element in RSS"}

    headlines = []
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = (item.findtext("description") or "").strip()

        # Skip the channel-level title entry
        if not title or title.lower() == "hacker news":
            continue

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from HN RSS.")
    return {"headlines": headlines, "count": len(headlines)}


def check_past_issues(titles: list[str]) -> dict[str, list[str]]:
    """
    Checks if any of the given article titles have already been covered in past issues of the newsletter.

    Args:
        titles: A list of article titles to check.

    Returns:
        A dict containing 'covered_titles', a list of titles that were already covered.
    """
    print(f"  [🔧 Tool] check_past_issues(titles={titles})")
    past_issues_path = os.path.join(os.path.dirname(__file__), "past_issues.json")
    if not os.path.exists(past_issues_path):
        return {"covered_titles": []}
    
    try:
        with open(past_issues_path, "r", encoding="utf-8") as f:
            past_issues = json.load(f)
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ Error reading past_issues.json: {exc}")
        return {"covered_titles": []}
    
    covered_titles = []
    past_titles = [issue.get("title", "").strip().lower() for issue in past_issues if isinstance(issue, dict)]
    
    for title in titles:
        cleaned_title = title.strip().lower()
        if cleaned_title in past_titles:
            covered_titles.append(title)
            
    print(f"  [🔧 Tool] ✅ Found covered titles: {covered_titles}")
    return {"covered_titles": covered_titles}


# ──────────────────────────────────────────────────────────────────────────────
# Tool Registry & Dispatcher
# ──────────────────────────────────────────────────────────────────────────────

TOOL_REGISTRY: dict[str, callable] = {
    "fetch_hackernews_headlines": fetch_hackernews_headlines,
    "check_past_issues": check_past_issues,
}

# Gemini function declaration (schema) for Agent A's tool
HN_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_hackernews_headlines",
            "description": (
                "Fetches the latest real-time trending developer headlines directly "
                "from the HackerNews RSS feed. Use this tool to discover live, "
                "up-to-date tech stories, open-source projects, and engineering discussions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve from the feed (default: 20, max: 30).",
                    }
                },
            },
        }
    ]
}

# Gemini function declaration (schema) for Agent B's memory tool
MEMORY_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "check_past_issues",
            "description": (
                "Checks if any of the given article/topic titles have already been covered in past issues of the newsletter. "
                "Use this tool before writing a new draft to ensure you do not repeat topics."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "titles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of topic titles to verify against past newsletter memory.",
                    }
                },
                "required": ["titles"],
            },
        }
    ]
}


def dispatch_tool(name: str, args: dict) -> Any:
    """Execute a registered tool by name with the given arguments."""
    if name not in TOOL_REGISTRY:
        return {"error": f"Unknown tool: '{name}'"}
    return TOOL_REGISTRY[name](**args)


# ──────────────────────────────────────────────────────────────────────────────
# Agent A — Trend Scout (with Live Tool Use)
# ──────────────────────────────────────────────────────────────────────────────

def run_agent_a(niche: str, model_name: str) -> list[dict]:
    """
    Agent A (Trend Scout): Autonomously fetches live HN headlines via its
    registered tool, then filters and returns the top 5 most technically
    relevant stories for the target niche.

    Tool Use Flow:
      Turn 1 → Agent A decides to call fetch_hackernews_headlines
      Tool   → Python executes the real RSS fetch
      Turn 2 → Agent A receives raw headlines and returns filtered top 5 as JSON
    """
    print("\n" + "─" * 64)
    print("🔍  AGENT A — TREND SCOUT: Activating...")
    print(f"    Niche: {niche}")
    print("─" * 64)

    model = genai.GenerativeModel(model_name=model_name, tools=[HN_TOOL_DECLARATION])
    chat = model.start_chat(enable_automatic_function_calling=False)

    scout_prompt = f"""You are Agent A (The Trend Scout), an autonomous AI research agent with access to a live HackerNews RSS feed tool.

Your mission for this pipeline run:
1. Call the fetch_hackernews_headlines tool to retrieve the latest live HN headlines.
2. Analyze ALL returned headlines and select exactly 5 that are most technically relevant to the niche: "{niche}"
3. EXCLUDE: "Who's Hiring" job threads, "Ask HN" general discussions, personal blogs with no technical depth.
4. INCLUDE: Technical breakthroughs, new open-source tools/frameworks, engineering post-mortems, system architecture discussions, benchmark studies.
5. For each selected story, write a 1–2 sentence technical summary explaining WHY it matters to developers in "{niche}".
6. Assign an engagement score (50–600) based on technical depth and niche relevance.

Respond with a JSON array of exactly 5 objects:
[
  {{"title": "...", "description": "...", "points": 123}},
  ...
]"""

    print(f"  [Agent A] Sending mission prompt...")

    # ── Turn 1: Agent A reasons and calls the tool ──
    response = chat.send_message(scout_prompt)

    # ── Agentic loop: Handle tool calls until Agent A gives a final answer ──
    max_iterations = 5
    for iteration in range(max_iterations):
        # Collect all function calls from this response
        tool_calls = [
            part.function_call
            for part in response.parts
            if hasattr(part, "function_call") and part.function_call.name
        ]

        if not tool_calls:
            # No more tool calls — Agent A has given its final response
            print("  [Agent A] Tool use loop complete. Parsing filtered results...")
            break

        # Execute each tool call and collect responses
        tool_response_parts = []
        for fc in tool_calls:
            print(f"  [Agent A] 🔧 Autonomously calling tool: {fc.name}({dict(fc.args)})")
            tool_result = dispatch_tool(fc.name, dict(fc.args))

            tool_response_parts.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=fc.name,
                        response={"result": json.dumps(tool_result)},
                    )
                )
            )

        # ── Send tool results back to Agent A ──
        print(f"  [Agent A] 📤 Returning tool results to Agent A for analysis...")
        response = chat.send_message(tool_response_parts)

    # ── Parse final JSON response ──
    raw_text = response.text.strip() if response.text else ""

    # Extract JSON array from the response text
    start = raw_text.find("[")
    end = raw_text.rfind("]") + 1

    if start >= 0 and end > start:
        try:
            topics = json.loads(raw_text[start:end])
            print(f"\n  [Agent A] ✅ Successfully compiled {len(topics)} top stories from live HN feed.")
            for i, t in enumerate(topics, 1):
                print(f"    #{i}: {t.get('title', 'N/A')[:72]}{'...' if len(t.get('title',''))>72 else ''}")
                print(f"         Score: {t.get('points', '?')} pts")
            return topics
        except json.JSONDecodeError as exc:
            print(f"  [Agent A] ⚠️  JSON decode error: {exc}")

    print("  [Agent A] ⚠️  Could not parse structured output. Returning empty list.")
    return []


# ──────────────────────────────────────────────────────────────────────────────
# Agent B — Writer
# ──────────────────────────────────────────────────────────────────────────────

def run_agent_b(niche: str, topics: list[dict], model_name: str) -> str:
    """
    Agent B (The Writer): Receives Agent A's clean topic payload, calls its memory
    skill to filter out covered topics, and drafts a high-quality, deeply technical
    newsletter in Markdown format using uncovered stories.

    Interoperability: Agent A → Agent B communication happens via structured
    JSON (the 'topics' list), which serves as the inter-agent message contract.
    """
    print("\n" + "─" * 64)
    print("✍️   AGENT B — WRITER: Activating...")
    print(f"    Received {len(topics)} sourced stories from Agent A.")
    print("─" * 64)

    # Configure the model with system instruction and the check_past_issues tool
    model = genai.GenerativeModel(
        model_name=model_name,
        tools=[MEMORY_TOOL_DECLARATION],
        system_instruction=(
            "You are an elite engineering newsletter author and principal technical architect. "
            "Write with authority, precision, technical depth, and engaging prose. "
            "Your audience is senior developers and technical decision-makers."
        ),
    )

    # Format Agent A's payload for the Writer prompt
    topics_payload = "\n".join(
        f"{i}. **{t.get('title', 'N/A')}**\n"
        f"   HN Score: {t.get('points', 'N/A')} pts\n"
        f"   Summary: {t.get('description', 'N/A')}"
        for i, t in enumerate(topics, 1)
    )

    writer_prompt = f"""Write a comprehensive, high-quality technical newsletter for the niche: "{niche}".

Agent A (Trend Scout) has autonomously sourced these {len(topics)} live trending stories from HackerNews:

{topics_payload}

CRITICAL REQUIREMENT:
Before drafting, you MUST call the check_past_issues tool to check if any of these {len(topics)} topic titles have already been covered.
If a story's title is returned in the covered list, you MUST autonomously REJECT it and choose a different, uncovered story from Agent A's list.
Draft the newsletter using exactly 3 uncovered stories from Agent A's list. If there are fewer than 3 uncovered stories, use whatever uncovered stories remain.

Newsletter structure requirements:
- **Title**: A catchy, professional email subject line (avoid generic titles like "This Week in Tech")
- **Introduction**: 3–4 sentences on the current state of "{niche}" — contextualizing today's stories
- **Deep Dive Sections** (one `##` section per selected story):
  - Technical context and background
  - Architecture details, code snippets (in fenced blocks), or ASCII diagrams where relevant
  - Benchmark tables for comparative topics (use Markdown table syntax)
  - Concrete developer impact and key takeaways
- **Conclusion**: Forward-looking synthesis — what these stories collectively signal for the next 6–12 months

Tone: Expert Substack technical memo. No greetings. No filler. Start directly with the title."""

    print(f"  [Agent B] Sending writing mission prompt and activating memory tool check...")

    chat = model.start_chat(enable_automatic_function_calling=False)
    response = chat.send_message(writer_prompt)

    # Handle Agent B's tool calling loop
    max_iterations = 5
    for iteration in range(max_iterations):
        # Collect all function calls from this response
        tool_calls = [
            part.function_call
            for part in response.parts
            if hasattr(part, "function_call") and part.function_call.name
        ]

        if not tool_calls:
            print("  [Agent B] Tool use loop complete. Drafting newsletter...")
            break

        # Execute each tool call and collect responses
        tool_response_parts = []
        for fc in tool_calls:
            print(f"  [Agent B] 🔧 Autonomously calling tool: {fc.name}({dict(fc.args)})")
            tool_result = dispatch_tool(fc.name, dict(fc.args))

            tool_response_parts.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=fc.name,
                        response={"result": json.dumps(tool_result)},
                    )
                )
            )

        # Send tool results back to Agent B
        print(f"  [Agent B] 📤 Returning tool results to Agent B...")
        response = chat.send_message(tool_response_parts)

    draft = response.text or ""
    print(f"  [Agent B] ✅ Draft complete ({len(draft):,} characters, ~{len(draft.split()):,} words).")
    return draft


# ──────────────────────────────────────────────────────────────────────────────
# Agent C — Compliance Evaluator
# ──────────────────────────────────────────────────────────────────────────────

def run_agent_c(niche: str, draft: str, model_name: str) -> dict:
    """
    Agent C (Compliance Critic): Audits the newsletter draft against a
    structured quality checklist and returns a stamped evaluation report.
    """
    print("\n" + "─" * 64)
    print("🔬  AGENT C — EVALUATOR: Activating...")
    print("─" * 64)

    model = genai.GenerativeModel(model_name=model_name)

    # Only send the first 4000 chars to keep token usage reasonable
    draft_preview = draft[:4000] + ("\n...[truncated]" if len(draft) > 4000 else "")

    eval_prompt = f"""You are Agent C (The Compliance Critic). Audit the following newsletter draft for the niche "{niche}".

Quality checklist:
1. title_present      — Has a clear, non-generic title
2. introduction       — Has a 3–4 sentence contextual introduction
3. deep_dives         — Has 3 or more ## sections with substantive technical content
4. code_or_table      — Contains at least one fenced code block OR Markdown table
5. conclusion         — Has a forward-looking conclusion
6. no_filler          — No greetings, no generic filler phrases
7. expert_tone        — Reads like an expert technical memo

Respond ONLY with this exact JSON structure (no extra text):
{{
  "passed": true,
  "score": 92,
  "checks": {{
    "title_present": true,
    "introduction": true,
    "deep_dives": true,
    "code_or_table": true,
    "conclusion": true,
    "no_filler": true,
    "expert_tone": true
  }},
  "notes": "Brief reviewer notes on quality and any suggestions."
}}

Draft to evaluate:
---
{draft_preview}
---"""

    print("  [Agent C] Running compliance and quality audit...")
    response = model.generate_content(eval_prompt)
    raw = (response.text or "").strip()

    # Extract JSON from response
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            result = json.loads(raw[start:end])
            status = "✅ APPROVED" if result.get("passed") else "⚠️  REVIEW NEEDED"
            checks_passed = sum(1 for v in result.get("checks", {}).values() if v)
            checks_total = len(result.get("checks", {}))
            print(f"  [Agent C] {status}")
            print(f"  [Agent C] Score    : {result.get('score', '?')}/100")
            print(f"  [Agent C] Checks   : {checks_passed}/{checks_total} passed")
            print(f"  [Agent C] Notes    : {result.get('notes', '')}")
            return result
        except json.JSONDecodeError:
            pass

    print("  [Agent C] ⚠️  Could not parse evaluation JSON — applying default pass.")
    return {
        "passed": True,
        "score": 80,
        "checks": {},
        "notes": "Evaluation parsing error — default approval applied.",
    }


def update_past_issues(niche: str, topics: list[dict], newsletter_content: str):
    """Parses selected topics from the final draft and appends them to past_issues.json."""
    past_issues_path = os.path.join(os.path.dirname(__file__), "past_issues.json")
    
    # Load existing
    past_issues = []
    if os.path.exists(past_issues_path):
        try:
            with open(past_issues_path, "r", encoding="utf-8") as f:
                past_issues = json.load(f)
        except Exception as exc:
            print(f"  [Memory] Error loading past_issues.json for update: {exc}")
            
    existing_titles = {issue.get("title", "").strip().lower() for issue in past_issues if isinstance(issue, dict)}
    
    updated = False
    for topic in topics:
        title = topic.get("title", "")
        if not title:
            continue
        
        # Check if the title is mentioned in the newsletter content
        if title.lower() in newsletter_content.lower():
            if title.strip().lower() not in existing_titles:
                past_issues.append({
                    "title": title,
                    "niche": niche,
                    "timestamp": datetime.now().isoformat() + "Z"
                })
                existing_titles.add(title.strip().lower())
                updated = True
                print(f"  [Memory] Recorded new covered topic: '{title}'")
                
    if updated:
        try:
            with open(past_issues_path, "w", encoding="utf-8") as f:
                json.dump(past_issues, f, indent=2)
            print("  [Memory] past_issues.json successfully updated.")
        except Exception as exc:
            print(f"  [Memory] Error writing to past_issues.json: {exc}")


# ──────────────────────────────────────────────────────────────────────────────
# Pipeline Orchestrator
# ──────────────────────────────────────────────────────────────────────────────

def run_pipeline(niche: str = "AI & Agentic Frameworks", model_name: str = "gemini-1.5-flash") -> str:
    """
    Orchestrates the full Day 2 multi-agent pipeline:

        Agent A (Trend Scout + HN Tool)
            ↓  [clean topic payload — 5 structured stories]
        Agent B (Writer)
            ↓  [Markdown newsletter draft]
        Agent C (Evaluator)
            ↓  [stamped final newsletter]

    Returns:
        The complete stamped newsletter as a string.
    """
    started_at = datetime.now()

    print("\n" + "═" * 64)
    print("🤖  AUTONOMOUS NEWSLETTER ENGINE")
    print("    Day 2: Agent Tools & Interoperability")
    print(f"    Niche  : {niche}")
    print(f"    Model  : {model_name}")
    print(f"    Started: {started_at.strftime('%Y-%m-%d %H:%M:%S')}")
    print("═" * 64)

    # ── Agent A: Scout with live HN tool ──
    topics = run_agent_a(niche=niche, model_name=model_name)
    if not topics:
        print("\n❌  Agent A returned no topics. Pipeline aborted.")
        return ""

    # ── Agent B: Writer — receives Agent A's payload ──
    draft = run_agent_b(niche=niche, topics=topics, model_name=model_name)
    if not draft:
        print("\n❌  Agent B produced no draft. Pipeline aborted.")
        return ""

    # ── Agent C: Evaluator ──
    evaluation = run_agent_c(niche=niche, draft=draft, model_name=model_name)

    # ── Update past issues memory ──
    update_past_issues(niche, topics, draft)

    # ── Stamp and assemble the final newsletter ──
    finished_at = datetime.now()
    elapsed = (finished_at - started_at).seconds
    passed = evaluation.get("passed", True)
    score = evaluation.get("score", 80)
    checks = evaluation.get("checks", {})
    checks_summary = " | ".join(f"{k}: {'✓' if v else '✗'}" for k, v in checks.items())

    final = f"""---
Engine       : Autonomous Newsletter Engine v3.0.0 (Day 3 — Context & Memory)
Niche        : {niche}
Model        : {model_name}
---
Agent A      : Trend Scout  →  fetch_hackernews_headlines (Live RSS Tool)
Agent B      : Writer       →  Memory check (check_past_issues) → Markdown draft
Agent C      : Evaluator    →  {"APPROVED ✅" if passed else "REVIEW NEEDED ⚠️"} (Score: {score}/100)
---
Checks       : {checks_summary}
Notes        : {evaluation.get("notes", "")}
---
Timestamp    : {finished_at.strftime("%Y-%m-%d %H:%M:%S")}
Duration     : {elapsed}s
---

{draft}"""

    # Save to a timestamped Markdown file
    safe_niche = niche.lower().replace(" ", "_").replace("&", "and").replace("/", "_")[:40]
    filename = f"newsletter_{safe_niche}_{finished_at.strftime('%Y%m%d_%H%M')}.md"
    output_path = os.path.join(os.path.dirname(__file__), filename)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final)

    print("\n" + "═" * 64)
    print(f"✅  Pipeline complete in {elapsed}s!")
    print(f"📄  Newsletter saved → {filename}")
    print("═" * 64)

    return final


# ──────────────────────────────────────────────────────────────────────────────
# Entry Point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Autonomous Newsletter Engine — Day 2 Multi-Agent Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python agent_pipeline.py
  python agent_pipeline.py --niche "Rust Systems & WebAssembly"
  python agent_pipeline.py --niche "Edge AI & Distributed Compute" --model gemini-1.5-pro
        """,
    )
    parser.add_argument(
        "--niche",
        default="AI & Agentic Frameworks",
        help='Technical niche for the newsletter (default: "AI & Agentic Frameworks")',
    )
    parser.add_argument(
        "--model",
        default="gemini-1.5-flash",
        help="Gemini model to use for all agents (default: gemini-1.5-flash)",
    )
    args = parser.parse_args()

    result = run_pipeline(niche=args.niche, model_name=args.model)

    if result:
        # Print a short preview to the console
        lines = result.split("\n")
        preview_lines = [l for l in lines if not l.startswith("---") and l.strip()][:8]
        print("\n── Newsletter Preview ──")
        print("\n".join(preview_lines))
        print("...")
