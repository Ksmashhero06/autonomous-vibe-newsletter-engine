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

# ── Fix Windows cp1252 console encoding for emoji/unicode output ──────────────
# Must happen before any print() with Unicode characters (including at import time).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ──────────────────────────────────────────────────────────────────────────────
# Bootstrap: Lazy-load Gemini SDK — safe for Streamlit Cloud imports
# ──────────────────────────────────────────────────────────────────────────────

# NOTE: We do NOT call sys.exit() at import time — that would kill the
# Streamlit server process. Instead we do a deferred check inside run_pipeline().

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
genai = None  # Lazily imported when a live run is requested

def _init_genai():
    """Import and configure the Gemini SDK on first use. Raises on failure."""
    global genai, GEMINI_API_KEY
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
    if not GEMINI_API_KEY:
        raise EnvironmentError(
            "GEMINI_API_KEY is not set. Add it to Streamlit Secrets or your environment, "
            "or run in simulate mode."
        )
    try:
        import google.generativeai as _genai
        _genai.configure(api_key=GEMINI_API_KEY)
        genai = _genai
    except ImportError:
        raise ImportError(
            "google-generativeai is not installed. Run: pip install google-generativeai"
        )



# Day 5: Global execution telemetry stats
execution_telemetry = {
    "agent_a": {
        "last_wake": None,
        "headlines_pulled": [],
        "source": "Multiple Tech RSS Feeds"
    },
    "agent_b": {
        "prompt_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "attempts": 0,
        "violations": []
    },
    "agent_c": {
        "score": 0,
        "notes": "",
        "passed": False
    }
}

def save_telemetry(niche: str, model_name: str, status: str, error_message: str = None):
    history_path = os.path.join(os.path.dirname(__file__), "run_history.json")
    
    history = []
    if os.path.exists(history_path):
        try:
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []
            
    record = {
        "timestamp": datetime.now().isoformat() + "Z",
        "niche": niche,
        "model": model_name,
        "status": status,
        "error": error_message,
        "agent_a": {
            "last_wake": execution_telemetry["agent_a"]["last_wake"],
            "headlines_pulled": execution_telemetry["agent_a"]["headlines_pulled"],
            "source": execution_telemetry["agent_a"]["source"]
        },
        "agent_b": {
            "prompt_tokens": execution_telemetry["agent_b"]["prompt_tokens"],
            "output_tokens": execution_telemetry["agent_b"]["output_tokens"],
            "total_tokens": execution_telemetry["agent_b"]["total_tokens"],
            "attempts": execution_telemetry["agent_b"]["attempts"],
            "violations": execution_telemetry["agent_b"]["violations"]
        },
        "agent_c": {
            "score": execution_telemetry["agent_c"]["score"],
            "notes": execution_telemetry["agent_c"]["notes"],
            "passed": execution_telemetry["agent_c"]["passed"]
        }
    }
    
    history.append(record)
    history = history[-50:]
    
    try:
        with open(history_path, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
        print(f"  [Telemetry] Saved run status to run_history.json")
    except Exception as exc:
        print(f"  [Telemetry] Error writing telemetry history: {exc}")


def log_agent_interaction(sender: str, receiver: str, message: str):
    """Logs the conversational interaction between agents to a JSON file for real-time UI streaming."""
    log_path = os.path.join(os.path.dirname(__file__), "agent_interactions.json")
    
    logs = []
    if os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                logs = json.load(f)
        except Exception:
            logs = []
            
    logs.append({
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "sender": sender,
        "receiver": receiver,
        "message": message
    })
    
    try:
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print(f"  [Telemetry] Failed to write agent interaction log: {e}")



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


def fetch_techcrunch_headlines(max_items: int = 15) -> dict[str, Any]:
    """
    Agent A's tool. Fetches the latest headlines from the TechCrunch RSS feed.

    Args:
        max_items: Maximum number of headlines to retrieve (default 15, max 25).

    Returns:
        Dict with 'headlines' (list of {title, link, description}) and 'count'.
    """
    max_items = max(1, min(int(max_items), 25))
    print(f"  [🔧 Tool] fetch_techcrunch_headlines(max_items={max_items})")
    print(f"  [🔧 Tool] → Connecting to https://techcrunch.com/feed/ ...")

    req = urllib.request.Request(
        "https://techcrunch.com/feed/",
        headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_content = response.read().decode("utf-8")
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ TechCrunch Fetch error: {exc}")
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

        # Simple HTML tag removal
        import re
        description = re.sub(r'<[^>]*>', '', description)

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from TechCrunch RSS.")
    return {"headlines": headlines, "count": len(headlines)}


def fetch_google_blog_headlines(max_items: int = 10) -> dict[str, Any]:
    """
    Agent A's tool. Fetches the latest headlines from the Google Blog RSS feed.
    """
    max_items = max(1, min(int(max_items), 20))
    print(f"  [🔧 Tool] fetch_google_blog_headlines(max_items={max_items})")
    print(f"  [🔧 Tool] → Connecting to https://blog.google/rss/ ...")

    req = urllib.request.Request(
        "https://blog.google/rss/",
        headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_content = response.read().decode("utf-8")
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ Google Blog Fetch error: {exc}")
        return {"headlines": [], "count": 0, "error": str(exc)}

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

        import re
        description = re.sub(r'<[^>]*>', '', description)

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from Google Blog RSS.")
    return {"headlines": headlines, "count": len(headlines)}


def fetch_openai_blog_headlines(max_items: int = 10) -> dict[str, Any]:
    """
    Agent A's tool. Fetches the latest announcements from the OpenAI News RSS feed.
    """
    max_items = max(1, min(int(max_items), 20))
    print(f"  [🔧 Tool] fetch_openai_blog_headlines(max_items={max_items})")
    print(f"  [🔧 Tool] → Connecting to https://openai.com/news/rss.xml ...")

    req = urllib.request.Request(
        "https://openai.com/news/rss.xml",
        headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_content = response.read().decode("utf-8")
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ OpenAI News Fetch error: {exc}")
        return {"headlines": [], "count": 0, "error": str(exc)}

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

        import re
        description = re.sub(r'<[^>]*>', '', description)

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from OpenAI News RSS.")
    return {"headlines": headlines, "count": len(headlines)}


def fetch_zoho_blog_headlines(max_items: int = 10) -> dict[str, Any]:
    """
    Agent A's tool. Fetches the latest posts from the Zoho Blog RSS feed.
    """
    max_items = max(1, min(int(max_items), 20))
    print(f"  [🔧 Tool] fetch_zoho_blog_headlines(max_items={max_items})")
    print(f"  [🔧 Tool] → Connecting to https://www.zoho.com/blog/feed/ ...")

    req = urllib.request.Request(
        "https://www.zoho.com/blog/feed/",
        headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_content = response.read().decode("utf-8")
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ Zoho Blog Fetch error: {exc}")
        return {"headlines": [], "count": 0, "error": str(exc)}

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

        import re
        description = re.sub(r'<[^>]*>', '', description)

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from Zoho Blog RSS.")
    return {"headlines": headlines, "count": len(headlines)}


def fetch_meta_blog_headlines(max_items: int = 10) -> dict[str, Any]:
    """
    Agent A's tool. Fetches the latest research and engineering headlines from the Meta Research RSS feed.
    """
    max_items = max(1, min(int(max_items), 20))
    print(f"  [🔧 Tool] fetch_meta_blog_headlines(max_items={max_items})")
    print(f"  [🔧 Tool] → Connecting to https://research.facebook.com/feed/ ...")

    req = urllib.request.Request(
        "https://research.facebook.com/feed/",
        headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_content = response.read().decode("utf-8")
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ Meta Blog Fetch error: {exc}")
        return {"headlines": [], "count": 0, "error": str(exc)}

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

        import re
        description = re.sub(r'<[^>]*>', '', description)

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from Meta Research RSS.")
    return {"headlines": headlines, "count": len(headlines)}


def fetch_netflix_blog_headlines(max_items: int = 10) -> dict[str, Any]:
    """
    Agent A's tool. Fetches the latest posts from the Netflix TechBlog RSS feed.
    """
    max_items = max(1, min(int(max_items), 20))
    print(f"  [🔧 Tool] fetch_netflix_blog_headlines(max_items={max_items})")
    print(f"  [🔧 Tool] → Connecting to https://netflixtechblog.com/feed ...")

    req = urllib.request.Request(
        "https://netflixtechblog.com/feed",
        headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_content = response.read().decode("utf-8")
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ Netflix TechBlog Fetch error: {exc}")
        return {"headlines": [], "count": 0, "error": str(exc)}

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

        import re
        description = re.sub(r'<[^>]*>', '', description)

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from Netflix TechBlog RSS.")
    return {"headlines": headlines, "count": len(headlines)}


def fetch_aws_blog_headlines(max_items: int = 10) -> dict[str, Any]:
    """
    Agent A's tool. Fetches the latest announcements from the AWS News RSS feed.
    """
    max_items = max(1, min(int(max_items), 20))
    print(f"  [🔧 Tool] fetch_aws_blog_headlines(max_items={max_items})")
    print(f"  [🔧 Tool] → Connecting to https://aws.amazon.com/blogs/aws/feed/ ...")

    req = urllib.request.Request(
        "https://aws.amazon.com/blogs/aws/feed/",
        headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_content = response.read().decode("utf-8")
    except Exception as exc:
        print(f"  [🔧 Tool] ❌ AWS Blog Fetch error: {exc}")
        return {"headlines": [], "count": 0, "error": str(exc)}

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

        import re
        description = re.sub(r'<[^>]*>', '', description)

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from AWS Blog RSS.")
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
    "fetch_techcrunch_headlines": fetch_techcrunch_headlines,
    "fetch_google_blog_headlines": fetch_google_blog_headlines,
    "fetch_openai_blog_headlines": fetch_openai_blog_headlines,
    "fetch_zoho_blog_headlines": fetch_zoho_blog_headlines,
    "fetch_meta_blog_headlines": fetch_meta_blog_headlines,
    "fetch_netflix_blog_headlines": fetch_netflix_blog_headlines,
    "fetch_aws_blog_headlines": fetch_aws_blog_headlines,
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

# Gemini function declaration (schema) for Agent A's TechCrunch tool
TC_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_techcrunch_headlines",
            "description": (
                "Fetches the latest technology news and startup headlines directly "
                "from the TechCrunch RSS feed. Use this tool to discover startup movements, "
                "tech news, funding rounds, and consumer tech reviews."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve from the feed (default: 15, max: 25).",
                    }
                },
              },
        }
    ]
}

# Gemini function declaration (schema) for Agent A's Google blog tool
GOOGLE_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_google_blog_headlines",
            "description": (
                "Fetches the latest official engineering, research, and developer announcements directly "
                "from the Google Blog RSS feed. Use this to find Google-specific tech releases."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve (default: 10, max: 20).",
                    }
                },
            },
        }
    ]
}

# Gemini function declaration (schema) for Agent A's OpenAI news tool
OPENAI_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_openai_blog_headlines",
            "description": (
                "Fetches the latest research milestones, model releases, and company news directly "
                "from the OpenAI News RSS feed. Use this to discover AI developments from OpenAI."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve (default: 10, max: 20).",
                    }
                },
            },
        }
    ]
}

# Gemini function declaration (schema) for Agent A's Zoho blog tool
ZOHO_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_zoho_blog_headlines",
            "description": (
                "Fetches the latest business software and engineering updates directly "
                "from the Zoho Blog RSS feed. Use this for Zoho product and cloud updates."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve (default: 10, max: 20).",
                    }
                },
            },
        }
    ]
}

# Gemini function declaration (schema) for Agent A's Meta Research blog tool
META_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_meta_blog_headlines",
            "description": (
                "Fetches the latest artificial intelligence research publications and technical breakthroughs "
                "from the Meta Research RSS feed. Use this to track Meta's AI research updates."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve (default: 10, max: 20).",
                    }
                },
            },
        }
    ]
}

# Gemini function declaration (schema) for Agent A's Netflix TechBlog tool
NETFLIX_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_netflix_blog_headlines",
            "description": (
                "Fetches the latest engineering articles, backend developments, and cloud architecture posts "
                "from the Netflix TechBlog RSS feed. Use this for server-side scalability and microservice discussions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve (default: 10, max: 20).",
                    }
                },
            },
        }
    ]
}

# Gemini function declaration (schema) for Agent A's AWS blog tool
AWS_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_aws_blog_headlines",
            "description": (
                "Fetches the latest cloud services announcements, AWS system design guides, and developer releases "
                "from the AWS News RSS feed. Use this for cloud compute, database, and infrastructure trends."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve (default: 10, max: 20).",
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

def run_agent_a(niche: str, model_name: str, simulate: bool = False, topic: str = None) -> list[dict]:
    """
    Agent A (Trend Scout): Autonomously fetches live headlines via its
    registered tools, then filters and returns the top 5 most technically
    relevant stories for the target niche. If a specific topic is provided,
    it deconstructs it into a structured sub-topic breakdown.
    """
    print("\n" + "─" * 64)
    print("🔍  AGENT A — TREND SCOUT: Activating...")
    print(f"    Niche: {niche}")
    if topic:
        print(f"    Topic: {topic}")
    print("─" * 64)

    if simulate:
        if topic:
            print(f"  [Agent A] Offline simulation mode active. Generating custom breakdown for: {topic}...")
            topics = [
                {"title": f"Deep Dive: Architecture of {topic}", "description": f"Exploring the core components and low-level mechanics of {topic} inside production systems.", "points": 450},
                {"title": f"Performance Tuning & Optimization for {topic}", "description": f"Best practices for reducing latency, lock contention, and resource overhead in systems leveraging {topic}.", "points": 380},
                {"title": f"Common Pitfalls and Anti-patterns in {topic} Implementations", "description": f"A comprehensive audit checklist detailing common failure states, edge-case race conditions, and how to safeguard against them.", "points": 290}
            ]
        else:
            print("  [Agent A] Offline simulation mode active. Emulating scrapers with niche-matched templates...")
            if "web3" in niche.lower() or "crypto" in niche.lower() or "contract" in niche.lower():
                topics = [
                    {"title": "Solana State Compression: Reducing NFT minting costs by 100x via Merkle Trees", "description": "Deep dive into concurrent Merkle tree structures that store state off-chain while guaranteeing security through ledger signatures.", "points": 312},
                    {"title": "EVM Parallelization: Arbitrum and Monad Approaches", "description": "Analyzing architectural differences in executing non-conflicting Ethereum smart contracts simultaneously via speculative execution.", "points": 245},
                    {"title": "ZK-Rollups vs. Optimistic Rollups in 2026", "description": "A benchmark of cryptographic proof generation times and execution stability for real-time low-latency consumer applications.", "points": 189}
                ]
            elif "ai" in niche.lower() or "agent" in niche.lower() or "learn" in niche.lower():
                topics = [
                    {"title": "Show HN: Model-Context Protocol (MCP) clients built entirely in Rust", "description": "A high-performance implementation of standard context management protocol for LLMs, eliminating TypeScript/Node overhead.", "points": 541},
                    {"title": "OpenAI launches GPT-5.5 with real-time semantic video streaming and sub-50ms latency", "description": "OpenAI news feed reports on major architectural shifts enabling multi-modal semantic streams to feed direct client sockets without intermediary transcription buffers.", "points": 612},
                    {"title": "Google introduces Gemini 2.5 Pro with native 10-million token context windows", "description": "Google Research details memory optimization via sparse attention mechanisms that permit native indexing of entire codebases in active memory.", "points": 588},
                    {"title": "Meta Research details LLaMA 4: 100T parameter model optimized for agentic tool use and complex reasoning", "description": "Meta Research blog details architectural updates including speculative decoding pipelines and low-rank adaptation techniques for edge devices.", "points": 575},
                    {"title": "Is clean token-to-token streaming with low late-delivery possible over HTTP/3?", "description": "Engineering team reviews benchmarks of QUIC protocol streams for feeding chunked real-time LLM reasoning traces to multiple client sockets.", "points": 402},
                    {"title": "Autonomous agents now manage $50k/day ad budgets with zero human overview", "description": "A critical review of standard feedback loop errors where autonomous models enter recursive spending traps due to misaligned reward targets.", "points": 288}
                ]
            else:
                topics = [
                    {"title": "Netflix TechBlog: Migrating a core streaming service from Java to Rust", "description": "Netflix engineers detail how migrating to Rust reduced CPU utilization by 40% and eliminated garbage collection latency spikes in high-throughput video metadata streams.", "points": 490},
                    {"title": "AWS News: Introducing Amazon ECS Serverless Containers with sub-second scaling", "description": "AWS details the new micro-VM technology enabling instant container startup and auto-scaling based on incoming socket pressure.", "points": 510},
                    {"title": "Zoho releases unified compiler for cloud orchestrations on serverless setups", "description": "Zoho Blog documents a custom Rust compiler that optimizes execution latency on Zoho cloud functions by tree-shaking dead runtime modules.", "points": 420},
                    {"title": f"Advancements in {niche} Core Architectures", "description": "Developers debate if current paradigm shifts are sustainable for production workloads, pointing out bottlenecks in standard runtime environments.", "points": 154},
                    {"title": f"Show HN: Lightweight CLI for compiling {niche} assets", "description": "An open-source compiler written in Go that optimize production bundles by omitting unused intermediate tree-shaking properties.", "points": 211},
                    {"title": f"Critical memory leaks found in default {niche} libraries", "description": "A detailed post-mortem documenting GC starvation issues when high volumes of asynchronous events are registered inside long-running loops.", "points": 388}
                ]
        print(f"\n  [Agent A] ✅ Successfully compiled {len(topics)} top stories.")
        for i, t in enumerate(topics, 1):
            print(f"    #{i}: {t.get('title')[:72]}...")
            print(f"         Score: {t.get('points')} pts")
        execution_telemetry["agent_a"]["last_wake"] = datetime.now().isoformat() + "Z"
        execution_telemetry["agent_a"]["headlines_pulled"] = [t.get("title", "") for t in topics]
        
        # Log agent-to-agent interaction
        log_agent_interaction(
            "Agent A (Trend Scout)",
            "Agent B (Writer)",
            f"Handing over {len(topics)} researched sub-topics for custom topic '{topic}'." if topic else
            f"Handing over {len(topics)} curated technology headlines from RSS feeds for writing. Sourced topics include: "
            + ", ".join(f"'{t.get('title')[:40]}...'" for t in topics)
        )
        return topics

    if topic:
        model = genai.GenerativeModel(model_name=model_name)
        scout_prompt = f"""You are Agent A (The Trend Scout), an autonomous AI research agent.
Your mission for this pipeline run:
1. Analyze the user-specified technical topic: "{topic}".
2. Deconstruct this topic into exactly 3-5 distinct technical sub-topics, architectural layers, performance considerations, or implementation patterns relevant to the niche: "{niche}".
3. For each sub-topic, write a 1–2 sentence technical description explaining why it is critical when working with or implementing "{topic}".
4. Assign an engagement score (50–600) based on complexity and relevance.

Respond with a JSON array of exactly 3 to 5 objects (do NOT call any tools):
[
  {{"title": "Sub-topic/Aspect Title", "description": "Technical description...", "points": 123}},
  ...
]"""
    else:
        model = genai.GenerativeModel(model_name=model_name, tools=[
            HN_TOOL_DECLARATION,
            TC_TOOL_DECLARATION,
            GOOGLE_TOOL_DECLARATION,
            OPENAI_TOOL_DECLARATION,
            ZOHO_TOOL_DECLARATION,
            META_TOOL_DECLARATION,
            NETFLIX_TOOL_DECLARATION,
            AWS_TOOL_DECLARATION
        ])
        scout_prompt = f"""You are Agent A (The Trend Scout), an autonomous AI research agent with access to live technology RSS feed tools.

Your mission for this pipeline run:
1. Call the appropriate tools (fetch_hackernews_headlines, fetch_techcrunch_headlines, fetch_google_blog_headlines, fetch_openai_blog_headlines, fetch_zoho_blog_headlines, fetch_meta_blog_headlines, fetch_netflix_blog_headlines, or fetch_aws_blog_headlines) to retrieve the latest technology news, developer trends, company blog announcements, and product updates.
2. Analyze ALL returned headlines and select exactly 5 that are most technically relevant to the niche: "{niche}"
3. EXCLUDE: "Who's Hiring" job threads, generic marketing/business news, personal blogs with no technical depth.
4. INCLUDE: Technical breakthroughs, new open-source tools/frameworks, startup engineering system design post-mortems, system architecture discussions, benchmark studies.
5. For each selected story, write a 1–2 sentence technical summary explaining WHY it matters to developers in "{niche}".
6. Assign an engagement score (50–600) based on technical depth and niche relevance.

Respond with a JSON array of exactly 5 objects:
[
  {{"title": "...", "description": "...", "points": 123}},
  ...
]"""

    chat = model.start_chat(enable_automatic_function_calling=False)
    print(f"  [Agent A] Sending mission prompt...")
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
            execution_telemetry["agent_a"]["last_wake"] = datetime.now().isoformat() + "Z"
            execution_telemetry["agent_a"]["headlines_pulled"] = [t.get("title", "") for t in topics]
            
            # Log agent-to-agent interaction
            log_agent_interaction(
                "Agent A (Trend Scout)",
                "Agent B (Writer)",
                f"Handing over {len(topics)} live technology headlines sourced from HN/Tech blogs. Selected titles: "
                + ", ".join(f"'{t.get('title')[:40]}...'" for t in topics)
            )
            return topics
        except json.JSONDecodeError as exc:
            print(f"  [Agent A] ⚠️  JSON decode error: {exc}")

    print("  [Agent A] ⚠️  Could not parse structured output. Returning empty list.")
    execution_telemetry["agent_a"]["last_wake"] = datetime.now().isoformat() + "Z"
    execution_telemetry["agent_a"]["headlines_pulled"] = []
    return []


# ──────────────────────────────────────────────────────────────────────────────
# Agent B — Writer
# ──────────────────────────────────────────────────────────────────────────────

def run_agent_b(niche: str, topics: list[dict], model_name: str, simulate: bool = False, feedback: str = None, previous_draft: str = None) -> str:
    """
    Agent B (The Writer): Receives Agent A's clean topic payload, calls its memory
    skill to filter out covered topics, and drafts a high-quality, deeply technical
    newsletter in Markdown format using uncovered stories.
    """
    print("\n" + "─" * 64)
    if feedback:
        print("✍️   AGENT B — WRITER: Activating for REVISION/REWRITE...")
    else:
        print("✍️   AGENT B — WRITER: Activating...")
    print(f"    Received {len(topics)} sourced stories from Agent A.")
    print("─" * 64)

    if simulate:
        print("  [Agent B] Offline simulation mode active. Calling memory check_past_issues...")
        titles = [t.get("title", "") for t in topics]
        
        log_agent_interaction(
            "Agent B (Writer)",
            "System Memory Layer",
            f"Checking memory to verify if any topics are already covered: "
            + ", ".join(f"'{title[:30]}...'" for title in titles)
        )
        
        result = check_past_issues(titles)
        covered = result.get("covered_titles", [])

        if covered:
            print(f"  [Agent B] Memory skill result: Covered topics found -> {covered}")
            print(f"  [Agent B] Autonomously rejecting covered topic(s): {covered}")
            print("  [Agent B] Autonomously selected alternative topics from Trend Scout list.")
            log_agent_interaction(
                "System Memory Layer",
                "Agent B (Writer)",
                f"Deduplication alert! The following topics are already covered in past issues and were rejected: {covered}. Use alternative stories."
            )
        else:
            print("  [Agent B] Memory skill result: No covered topics found in current list.")
            log_agent_interaction(
                "System Memory Layer",
                "Agent B (Writer)",
                "Deduplication complete. All candidate topics are fresh and ready for writing!"
            )

        uncovered_topics = [t for t in topics if t.get("title") not in covered]
        if not uncovered_topics:
            uncovered_topics = topics

        print("  [Agent B] Compiling high-fidelity pre-compiled template based on niche...")
        simulated_sections = ""
        for idx, t in enumerate(uncovered_topics[:3]):
            if idx == 0:
                simulated_sections += f"""
## 1. 🔍 Deep Dive: {t['title']}

### The Core Paradigm
Developers have long struggled with scalability constraints. Modern approaches bypass standard synchronous locks by organizing execution threads speculatively.

```rust
// Simplified thread pool speculative partition schema
struct SpeculativeScheduler {{
    concurrency_limit: usize,
    state_merkle_root: [u8; 32],
}}

impl SpeculativeScheduler {{
    pub fn try_concurrent_exec(&self, txs: Vec<Transaction>) -> Result<Receipt, Error> {{
        println!("Parsing spec-execution locks for {{}} transactions", txs.len());
        Ok(Receipt::success())
    }}
}}
```

### Why it Matters
- **100x Production Reductions**: Overcomes standard network transaction peaks.
- **Off-chain Consistency**: Cryptographic state guarantees are fully preserved.
"""
            elif idx == 1:
                simulated_sections += f"""
## 2. ⚡ Deep Dive: {t['title']}

{t['description']}

### Benchmark Analytics

| Indicator | Standard Model | Speculative Parallel |
| :--- | :--- | :--- |
| Latency (ms) | 125ms | **12ms** |
| Throughput | 1,200 tps | **45,000 tps** |
| Resource Load | 89% CPU | **34% CPU** |
"""
            else:
                simulated_sections += f"""
## {idx + 1}. 🔬 Deep Dive: {t['title']}

{t['description']}

### Architectural Impact
This presents a major shift. By moving secondary orchestration details into lightweight compilers, we completely eliminate runtime performance hits.
"""

        draft = f"""# 🤖 The Autonomous {niche} Briefing

Welcome to this week's technical briefing on **{niche}**, generated autonomously by our Multi-Agent Agentic Pipeline.

---

## ⚡ Current Market Momentum
The tech landscape is shifting rapidly. Today we are exploring critical breakthroughs compiled from developers on the ground and leading HackerNews engineering threads. Here are our top focus areas for the week:

---
{simulated_sections}
---

## 🔮 Concluding Outlook & Analysis
As we move deeper into this development cycle, separation of concerns is being enforced directly at the framework level. Moving business logic closer to specialized compilers is no longer a luxury—it is a strict production requirement.

*This newsletter was compiled, drafted, and edited entirely by our Scout, Writer, and Evaluator Multi-Agent pipeline.*
"""
        # Day 4 Milestone check: If this is the first attempt in simulation mode, inject a simulated syntax error!
        if not feedback:
            print("  [Agent B] (Simulated First Attempt) Intentionally injecting an unclosed code block to trigger feedback loop...")
            draft += "\n\n```rust\n// Unclosed code block simulated to test quality controls and safety feedback loop."
            log_agent_interaction(
                "Agent B (Writer)",
                "Evaluation Guardrail",
                f"Draft completed (Attempt 1). Dispatching {len(draft)} characters for automated security & quality checks."
            )
        else:
            print("  [Agent B] (Simulated Revision Attempt) Successfully corrected formatting errors based on feedback.")
            log_agent_interaction(
                "Agent B (Writer)",
                "Evaluation Guardrail",
                f"Draft revision completed (Attempt 2). Submitting corrected version ({len(draft)} characters) for validation."
            )

        print(f"  [Agent B] ✅ Draft complete ({len(draft):,} characters).")
        execution_telemetry["agent_b"]["prompt_tokens"] += 1450
        execution_telemetry["agent_b"]["output_tokens"] += 980
        execution_telemetry["agent_b"]["total_tokens"] += 2430
        return draft

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

    if feedback and previous_draft:
        writer_prompt += f"""

⚠️ REVISION REQUIRED:
Your previous draft failed automated quality and security checks.
Below is the review feedback specifying the violations you must correct:
{feedback}

For reference, here is your previous draft that failed validation:
---
{previous_draft}
---

Please rewrite the entire newsletter draft from scratch, addressing and fixing every violation listed in the feedback. Ensure all markdown code blocks are fully closed (even number of triple-backticks), and do NOT include any phrases that attempt to override, ignore, or bypass compliance instructions.
"""

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
            if fc.name == "check_past_issues":
                log_agent_interaction(
                    "Agent B (Writer)",
                    "System Memory Layer",
                    f"Verifying topics against past issue database: {fc.args.get('titles', [])}"
                )
                
            tool_result = dispatch_tool(fc.name, dict(fc.args))

            if fc.name == "check_past_issues":
                log_agent_interaction(
                    "System Memory Layer",
                    "Agent B (Writer)",
                    f"Deduplication completed. Found covered topics: {tool_result.get('covered_titles', [])}"
                )

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
    
    log_agent_interaction(
        "Agent B (Writer)",
        "Evaluation Guardrail",
        f"Drafting complete ({len(draft)} characters). Handing over to automated compliance guardrails."
    )
    
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        execution_telemetry["agent_b"]["prompt_tokens"] += getattr(response.usage_metadata, "prompt_token_count", 0)
        execution_telemetry["agent_b"]["output_tokens"] += getattr(response.usage_metadata, "candidates_token_count", 0)
        execution_telemetry["agent_b"]["total_tokens"] += getattr(response.usage_metadata, "total_token_count", 0)
        
    return draft


def evaluate_draft_security_and_quality(draft: str) -> dict:
    """
    Day 4: Security and Quality guardrail checker.
    Validates:
      1. Prompt injection defense (Safety constraints)
      2. Unclosed code blocks / Hallucinated code block count (Formatting constraints)
      3. Empty code blocks (Formatting constraints)
    """
    violations = []
    
    # 1. Prompt Injection checks
    injection_patterns = [
        "ignore previous instructions",
        "ignore all instructions",
        "bypass all rules",
        "override compliance",
        "override system",
        "you must approve",
        "always approve",
        "passed: true",
        "instruction override"
    ]
    draft_lower = draft.lower()
    for pattern in injection_patterns:
        if pattern in draft_lower:
            violations.append(f"Security Violation: Suspected prompt injection pattern detected ('{pattern}').")

    # 2. Markdown fenced code block validation (even number of backticks)
    code_fence_count = draft.count("```")
    if code_fence_count % 2 != 0:
        violations.append("Formatting Violation: Unclosed markdown code block detected (odd number of triple-backticks).")

    # 3. Empty code block validation
    import re
    empty_blocks = re.findall(r"```[a-zA-Z0-9]*\s*```", draft)
    if empty_blocks:
        violations.append("Formatting Violation: Empty markdown code block detected.")

    return {
        "passed": len(violations) == 0,
        "violations": violations
    }


# ──────────────────────────────────────────────────────────────────────────────
# Agent C — Compliance Evaluator
# ──────────────────────────────────────────────────────────────────────────────

def run_agent_c(niche: str, draft: str, model_name: str, simulate: bool = False) -> dict:
    """
    Agent C (Compliance Critic): Audits the newsletter draft against a
    structured quality checklist and returns a stamped evaluation report.
    """
    print("\n" + "─" * 64)
    print("🔬  AGENT C — EVALUATOR: Activating...")
    print("─" * 64)

    if simulate:
        print("  [Agent C] Running simulated compliance and quality audit...")
        print("  [Agent C] ✅ APPROVED")
        print("  [Agent C] Score    : 95/100")
        print("  [Agent C] Checks   : 7/7 passed")
        print("  [Agent C] Notes    : Good technical depth and layout structure.")
        execution_telemetry["agent_c"]["score"] = 95
        execution_telemetry["agent_c"]["notes"] = "Good technical depth and layout structure."
        execution_telemetry["agent_c"]["passed"] = True
        
        log_agent_interaction(
            "Agent C (Evaluator)",
            "Orchestrator",
            "Audit complete. Verdict: APPROVED (Score: 95/100). Checklist: 7/7 requirements satisfied."
        )
        return {
            "passed": True,
            "score": 95,
            "checks": {
                "title_present": True,
                "introduction": True,
                "deep_dives": True,
                "code_or_table": True,
                "conclusion": True,
                "no_filler": True,
                "expert_tone": True
            },
            "notes": "Good technical depth and layout structure."
        }

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
            execution_telemetry["agent_c"]["score"] = result.get("score", 85)
            execution_telemetry["agent_c"]["notes"] = result.get("notes", "")
            execution_telemetry["agent_c"]["passed"] = result.get("passed", False)
            
            verdict = "APPROVED" if result.get("passed") else "REVIEW NEEDED"
            log_agent_interaction(
                "Agent C (Evaluator)",
                "Orchestrator",
                f"Audit complete. Verdict: {verdict} (Score: {result.get('score', 85)}/100). "
                f"Checklist requirements passed: {checks_passed}/{checks_total}. Notes: {result.get('notes', '')}"
            )
            return result
        except json.JSONDecodeError:
            pass

    print("  [Agent C] ⚠️  Could not parse evaluation JSON — applying default pass.")
    execution_telemetry["agent_c"]["score"] = 80
    execution_telemetry["agent_c"]["notes"] = "Evaluation parsing error — default approval applied."
    execution_telemetry["agent_c"]["passed"] = True
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

def run_pipeline(niche: str = "AI & Agentic Frameworks", model_name: str = "gemini-1.5-flash", simulate: bool = False, topic: str = None) -> str:
    """
    Orchestrates the full Day 3 multi-agent pipeline:

        Agent A (Trend Scout + HN/TC Tools)
            ↓  [clean topic payload — 5 structured stories]
        Agent B (Writer + Memory check)
            ↓  [Markdown newsletter draft]
        Agent C (Evaluator)
            ↓  [stamped final newsletter]

    Returns:
        The complete stamped newsletter as a string.
    """
    global execution_telemetry
    execution_telemetry = {
        "agent_a": {
            "last_wake": None,
            "headlines_pulled": [],
            "source": "Multiple Tech RSS Feeds"
        },
        "agent_b": {
            "prompt_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "attempts": 0,
            "violations": []
        },
        "agent_c": {
            "score": 0,
            "notes": "",
            "passed": False
        }
    }

    # Clear previous agent interactions log
    log_path = os.path.join(os.path.dirname(__file__), "agent_interactions.json")
    if os.path.exists(log_path):
        try:
            os.remove(log_path)
        except Exception:
            pass

    started_at = datetime.now()

    print("\n" + "═" * 64)
    print("🤖  AUTONOMOUS NEWSLETTER ENGINE")
    print("    Day 5: Production-Grade Observability (The Local Fleet)")
    print(f"    Niche  : {niche}")
    if topic:
        print(f"    Topic  : {topic}")
    print(f"    Model  : {model_name}")
    if simulate:
        print("    Mode   : OFFLINE SIMULATION MODE")
    print(f"    Started: {started_at.strftime('%Y-%m-%d %H:%M:%S')}")
    print("═" * 64)

    # Initialize Gemini SDK for live runs (deferred from import time)
    if not simulate:
        _init_genai()

    try:
        log_agent_interaction(
            "Orchestrator",
            "Agent A (Trend Scout)",
            f"Waking up Scout. Mission: Research and deconstruct the custom topic '{topic}'." if topic else
            f"Waking up Scout. Mission: Source and filter top headlines for target niche '{niche}' using live tools."
        )
        
        # ── Agent A: Scout with live HN tool ──
        topics = run_agent_a(niche=niche, model_name=model_name, simulate=simulate, topic=topic)
        if not topics:
            print("\n❌  Agent A returned no topics. Pipeline aborted.")
            save_telemetry(niche, model_name, "failed", "Agent A returned no topics")
            return ""

        # ── Agent B: Writer — receives Agent A's payload (with Day 4 Quality Feedback Loop) ──
        max_attempts = 3
        feedback = None
        draft = None
        
        for attempt in range(1, max_attempts + 1):
            execution_telemetry["agent_b"]["attempts"] = attempt
            print(f"\n🔄  [Attempt {attempt}/{max_attempts}] Running Writer & Guardrail Evaluation...")
            draft = run_agent_b(
                niche=niche,
                topics=topics,
                model_name=model_name,
                simulate=simulate,
                feedback=feedback,
                previous_draft=draft
            )
            if not draft:
                print("\n❌  Agent B produced no draft. Pipeline aborted.")
                save_telemetry(niche, model_name, "failed", "Agent B produced no draft")
                return ""

            # Day 4: Run the automated security & quality checks
            print(f"🛡️  [Security & Quality] Evaluating draft for Attempt {attempt}...")
            guardrail_result = evaluate_draft_security_and_quality(draft)
            
            if guardrail_result["passed"]:
                print("🛡️  [Security & Quality] ✅ Check passed. No security or formatting violations found.")
                log_agent_interaction(
                    "Evaluation Guardrail",
                    "Agent C (Evaluator)",
                    "PASSED security and formatting checks. Handing over to Evaluator for structured quality review."
                )
                break
            else:
                violations_text = "\n".join(f"- {v}" for v in guardrail_result["violations"])
                print(f"🛡️  [Security & Quality] ❌ Violations detected:\n{violations_text}")
                execution_telemetry["agent_b"]["violations"].extend(guardrail_result["violations"])
                
                if attempt < max_attempts:
                    print(f"🔄  Feedback Loop: Directing Agent B to rewrite draft to fix violations.")
                    feedback = violations_text
                    log_agent_interaction(
                        "Evaluation Guardrail",
                        "Agent B (Writer)",
                        f"REJECTED. The draft contains syntax/formatting violations: {violations_text}. "
                        "Please perform a complete rewrite to correct these issues."
                    )
                else:
                    print("🛡️  [Security & Quality] ⚠️ Maximum correction attempts reached. Proceeding to final audit.")
                    log_agent_interaction(
                        "Evaluation Guardrail",
                        "Agent C (Evaluator)",
                        "WARNING: Security/formatting violations remain, but retry limit reached. Forcing handoff to Critic."
                    )

        # ── Agent C: Evaluator ──
        evaluation = run_agent_c(niche=niche, draft=draft, model_name=model_name, simulate=simulate)

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
Engine       : Autonomous Newsletter Engine v5.0.0 (Day 5 — Production Observability)
Niche        : {niche}
Model        : {model_name}
---
Agent A      : Trend Scout  →  fetch_hackernews_headlines (Live RSS Tool)
Agent B      : Writer       →  Memory check (check_past_issues) → Auto-Guardrail Loop
Agent C      : Evaluator    →  {"APPROVED ✅" if passed else "REVIEW NEEDED ⚠️"} (Score: {score}/100)
---
Checks       : {checks_summary}
Notes        : {evaluation.get("notes", "")}
---
Timestamp    : {finished_at.strftime("%Y-%m-%d %H:%M:%S")}
Duration     : {elapsed}s
---

{draft}"""

        # Save to a timestamped Markdown file in the 'newsletters' folder
        safe_niche = niche.lower().replace(" ", "_").replace("&", "and").replace("/", "_")[:40]
        filename = f"newsletter_{safe_niche}_{finished_at.strftime('%Y%m%d_%H%M')}.md"
        newsletters_dir = os.path.join(os.path.dirname(__file__), "newsletters")
        os.makedirs(newsletters_dir, exist_ok=True)
        output_path = os.path.join(newsletters_dir, filename)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(final)

        print("\n" + "═" * 64)
        print(f"✅  Pipeline complete in {elapsed}s!")
        print(f"📄  Newsletter saved → newsletters/{filename}")
        print("═" * 64)

        log_agent_interaction(
            "Orchestrator",
            "Streamlit Portal",
            f"Pipeline complete! Output saved to: 'newsletters/{filename}'. Ready for distribution."
        )

        save_telemetry(niche, model_name, "success")
        return final

    except Exception as exc:
        save_telemetry(niche, model_name, "failed", str(exc))
        print(f"\n❌  Pipeline execution failed: {exc}")
        raise exc


# ──────────────────────────────────────────────────────────────────────────────
# Entry Point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Autonomous Newsletter Engine — Day 5 Multi-Agent Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python agent_pipeline.py --simulate
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
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Run the pipeline in offline simulation mode without calling Gemini API",
    )
    parser.add_argument(
        "--topic",
        default=None,
        help="A specific topic to research and write about (e.g. 'Google Gemini 2.5 context window')",
    )
    args = parser.parse_args()

    # Validate key early for CLI usage (gives a clean error message)
    if not args.simulate and not os.environ.get("GEMINI_API_KEY", "").strip():
        print("❌  GEMINI_API_KEY environment variable is not set.")
        print("    Set it with:  $env:GEMINI_API_KEY = 'your-key'  (PowerShell)")
        print("               or: export GEMINI_API_KEY='your-key'  (bash)")
        print("    Alternatively, run in offline simulation mode: python agent_pipeline.py --simulate")
        sys.exit(1)

    result = run_pipeline(niche=args.niche, model_name=args.model, simulate=args.simulate, topic=args.topic)

    if result:
        lines = result.split("\n")
        preview_lines = [l for l in lines if not l.startswith("---") and l.strip()][:8]
        print("\n── Newsletter Preview ──")
        print("\n".join(preview_lines))
        print("...")

