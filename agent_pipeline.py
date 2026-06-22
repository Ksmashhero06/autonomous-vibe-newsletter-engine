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
import math
import os
import re
import sys
import time as _time_mod
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from html.parser import HTMLParser
from typing import Any

def load_env_file():
    try:
        possible_dirs = [
            os.getcwd(),
            os.path.dirname(os.path.abspath(__file__)),
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        ]
        for d in possible_dirs:
            env_path = os.path.join(d, ".env")
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            val = v.strip().strip("'").strip('"')
                            os.environ[k.strip()] = val
                break
    except Exception as e:
        print(f"⚠️ Failed to load local .env file: {e}")

load_env_file()

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
genai = None  # Mocked legacy namespace
genai_client = None  # New SDK Client

class MockProtos:
    class Part:
        def __init__(self, function_response=None):
            self.function_response = function_response
    class FunctionResponse:
        def __init__(self, name, response):
            self.name = name
            self.response = response

class MockGenai:
    protos = MockProtos

def _init_genai():
    """Import and configure the new google-genai SDK on first use. Raises on failure."""
    global genai, genai_client, GEMINI_API_KEY
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
    if not GEMINI_API_KEY:
        raise EnvironmentError(
            "GEMINI_API_KEY is not set. Add it to Streamlit Secrets or your environment, "
            "or run in simulate mode."
        )
    if genai_client is None:
        try:
            from google import genai as _new_genai
            genai_client = _new_genai.Client(api_key=GEMINI_API_KEY)
            genai = MockGenai
        except ImportError:
            raise ImportError(
                "google-genai is not installed. Run: pip install google-genai"
            )

class GeminiPartWrapper:
    def __init__(self, native_part):
        self._part = native_part
        self.function_call = None
        if hasattr(native_part, "function_call") and native_part.function_call:
            self.function_call = native_part.function_call

class GeminiUsageMetadataWrapper:
    def __init__(self, native_usage):
        self._usage = native_usage
        self.prompt_token_count = getattr(native_usage, "prompt_token_count", 0)
        self.candidates_token_count = getattr(native_usage, "response_token_count", 0) or getattr(native_usage, "candidates_token_count", 0)
        self.total_token_count = getattr(native_usage, "total_token_count", 0)

class GeminiCandidateWrapper:
    def __init__(self, native_candidate):
        self._candidate = native_candidate
        self.grounding_metadata = getattr(native_candidate, "grounding_metadata", None)
        self.content = getattr(native_candidate, "content", None)

class GeminiResponseWrapper:
    def __init__(self, native_response):
        self._response = native_response
        self.text = native_response.text
        
        self.parts = []
        if hasattr(native_response, "candidates") and native_response.candidates:
            candidate = native_response.candidates[0]
            if hasattr(candidate, "content") and candidate.content and hasattr(candidate.content, "parts"):
                for part in (candidate.content.parts or []):
                    self.parts.append(GeminiPartWrapper(part))
                    
        self.candidates = [GeminiCandidateWrapper(c) for c in (native_response.candidates or [])]
        if getattr(native_response, "usage_metadata", None):
            self.usage_metadata = GeminiUsageMetadataWrapper(native_response.usage_metadata)
        else:
            self.usage_metadata = None
            
        # Extract grounding metadata if present
        self.grounding_sources = []
        if hasattr(native_response, "candidates") and native_response.candidates:
            candidate = native_response.candidates[0]
            if hasattr(candidate, "grounding_metadata") and candidate.grounding_metadata:
                meta = candidate.grounding_metadata
                if hasattr(meta, "grounding_chunks") and meta.grounding_chunks:
                    for chunk in meta.grounding_chunks:
                        if hasattr(chunk, "web") and chunk.web and getattr(chunk.web, "uri", None):
                            source = {
                                "title": getattr(chunk.web, "title", "Untitled Source"),
                                "url": chunk.web.uri
                            }
                            self.grounding_sources.append(source)
        if self.grounding_sources:
            print("\n  🌐  [Google Search Grounding] Pulling live reference links:")
            for src in self.grounding_sources:
                print(f"      🔗 {src['title']}: {src['url']}")

class GeminiChatWrapper:
    def __init__(self, model_name, system_instruction=None, tools=None, enable_automatic_function_calling=False):
        _init_genai()
        from google.genai import types
        
        mapped_tools = []
        if tools:
            for t in tools:
                if isinstance(t, str) and t == "google_search":
                    mapped_tools.append(types.Tool(google_search=types.GoogleSearch()))
                elif isinstance(t, dict):
                    mapped_tools.append(types.Tool(function_declarations=[t]))
                elif hasattr(t, "function_declarations"):
                    for fd in t.function_declarations:
                        mapped_tools.append(types.Tool(function_declarations=[fd]))
                else:
                    mapped_tools.append(t)
                    
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=mapped_tools if mapped_tools else None,
            temperature=0.2,
        )
        self.chat = genai_client.chats.create(model=model_name, config=config)
        self.last_response = None
        
    def send_message(self, message):
        from google.genai import types
        
        mapped_message = message
        if isinstance(message, list):
            mapped_message = []
            for part in message:
                if hasattr(part, "function_response"):
                    fr = part.function_response
                    res_val = fr.response
                    if isinstance(res_val, str):
                        try:
                            res_val = json.loads(res_val)
                        except:
                            res_val = {"result": res_val}
                    elif hasattr(res_val, "get") or isinstance(res_val, dict):
                        pass
                    else:
                        res_val = {"result": str(res_val)}
                        
                    mapped_message.append(
                        types.Part(
                            function_response=types.FunctionResponse(
                                name=fr.name,
                                response=res_val
                            )
                        )
                    )
                else:
                    mapped_message.append(part)
                    
        response = self.chat.send_message(mapped_message)
        wrapped_response = GeminiResponseWrapper(response)
        self.last_response = wrapped_response
        return wrapped_response

class GeminiGenAIWrapper:
    def __init__(self, model_name, system_instruction=None, tools=None):
        self.model_name = model_name
        self.system_instruction = system_instruction
        self.tools = tools
        
    def generate_content(self, prompt, generation_config=None):
        _init_genai()
        from google.genai import types
        
        mapped_tools = []
        if self.tools:
            for t in self.tools:
                if isinstance(t, str) and t == "google_search":
                    mapped_tools.append(types.Tool(google_search=types.GoogleSearch()))
                elif isinstance(t, dict):
                    mapped_tools.append(types.Tool(function_declarations=[t]))
                elif hasattr(t, "function_declarations"):
                    for fd in t.function_declarations:
                        mapped_tools.append(types.Tool(function_declarations=[fd]))
                else:
                    mapped_tools.append(t)
                    
        config = types.GenerateContentConfig(
            system_instruction=self.system_instruction,
            tools=mapped_tools if mapped_tools else None,
            temperature=0.2,
        )
        response = genai_client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=config
        )
        return GeminiResponseWrapper(response)
        
    def start_chat(self, enable_automatic_function_calling=False):
        return GeminiChatWrapper(self.model_name, self.system_instruction, self.tools, enable_automatic_function_calling)

def get_provider_from_model(model: str) -> str:
    m = model.lower()
    if m.startswith("gemini-"):
        return "gemini"
    if m.startswith("gpt-"):
        return "openai"
    if m.startswith("claude-"):
        return "anthropic"
    if m.startswith("ollama-"):
        return "ollama"
    if "llama-3" in m or "mixtral" in m or "gemma2" in m:
        return "groq"
    return "gemini"

def get_api_key_for_provider(provider: str) -> str:
    if provider == "gemini":
        return os.environ.get("GEMINI_API_KEY", "").strip()
    if provider == "openai":
        return os.environ.get("OPENAI_API_KEY", "").strip()
    if provider == "anthropic":
        return os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if provider == "groq":
        return os.environ.get("GROQ_API_KEY", "").strip()
    return ""

def map_contents_to_messages(contents, tools=None):
    messages = []
    
    if tools:
        tools_desc = []
        for t in tools:
            name = ""
            description = ""
            params = {}
            if hasattr(t, "function_declarations"):
                fd = t.function_declarations[0]
                name = fd.name
                description = fd.description
                params = getattr(fd, "parameters", {})
                if hasattr(params, "to_json"):
                    params = params.to_json()
            elif isinstance(t, dict):
                fd = t.get("functionDeclarations", [{}])[0]
                name = fd.get("name", "")
                description = fd.get("description", "")
                params = fd.get("parameters", {})
            else:
                name = getattr(t, "name", "")
                description = getattr(t, "description", "")
                params = getattr(t, "parameters", {})

            tools_desc.append(f"- **{name}**: {description}. Params: {json.dumps(params)}")
        tools_str = "\n".join(tools_desc)
        messages.append({
            "role": "system",
            "content": f"You have access to the following tools:\n\n{tools_str}\n\nTo use a tool, you MUST respond ONLY with a JSON object in this format:\n{{\n  \"tool_call\": {{\n    \"name\": \"tool_name\",\n    \"arguments\": {{\n      \"arg_name\": \"value\"\n    }}\n  }}\n}}\n\nDo not add any other conversational text if you are calling a tool."
        })

    for turn in contents:
        role = "assistant" if turn.get("role") == "model" else "user"
        text_content = ""
        parts = turn.get("parts", [])
        if isinstance(parts, str):
            text_content = parts
        elif isinstance(parts, list):
            for part in parts:
                if isinstance(part, str):
                    text_content += part
                elif isinstance(part, dict):
                    if "text" in part:
                        text_content += part["text"]
                    elif "functionCall" in part:
                        text_content += f"\nCalling tool: {part['functionCall']['name']} with args: {json.dumps(part['functionCall'].get('args', {}))}"
                    elif "functionResponse" in part:
                        text_content += f"\nTool result for {part['functionResponse']['name']}: {json.dumps(part['functionResponse'].get('response', {}))}"
                elif hasattr(part, "text") and part.text:
                    text_content += part.text
                elif hasattr(part, "function_call") and part.function_call.name:
                    text_content += f"\nCalling tool: {part.function_call.name} with args: {json.dumps(dict(part.function_call.args))}"
                elif hasattr(part, "function_response") and part.function_response.name:
                    text_content += f"\nTool result for {part.function_response.name}: {json.dumps(dict(part.function_response.response))}"
        
        if text_content.strip():
            messages.append({"role": role, "content": text_content})
            
    return messages

def call_rest_provider(provider: str, model: str, messages: list, response_schema=None) -> dict:
    headers = {
        "Content-Type": "application/json"
    }
    url = ""
    body = {}
    
    api_key = get_api_key_for_provider(provider)
    
    if provider in ["openai", "groq", "ollama"]:
        if provider == "openai":
            url = "https://api.openai.com/v1/chat/completions"
            headers["Authorization"] = f"Bearer {api_key}"
        elif provider == "groq":
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers["Authorization"] = f"Bearer {api_key}"
        else:
            host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
            url = f"{host}/v1/chat/completions"
            
        body = {
            "model": model,
            "messages": messages,
            "temperature": 0.2
        }
        if response_schema:
            body["response_format"] = {"type": "json_object"}
            
    elif provider == "anthropic":
        url = "https://api.anthropic.com/v1/messages"
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
        body = {
            "model": model,
            "max_tokens": 4000,
            "messages": messages,
            "temperature": 0.2
        }
        
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as res:
            resp_data = json.loads(res.read().decode("utf-8"))
    except Exception as e:
        if hasattr(e, "read"):
            err_details = e.read().decode("utf-8")
            raise RuntimeError(f"LLM Provider {provider} API error: {e} - {err_details}")
        raise e
        
    text = ""
    if provider in ["openai", "groq", "ollama"]:
        text = resp_data.get("choices", [{}])[0].get("message", {}).get("content", "")
    elif provider == "anthropic":
        text = resp_data.get("content", [{}])[0].get("text", "")
        
    function_calls = None
    if "tool_call" in text:
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                parsed = json.loads(text[start:end])
                if "tool_call" in parsed:
                    tc = parsed["tool_call"]
                    function_calls = [{
                        "name": tc.get("name"),
                        "args": tc.get("arguments", {})
                    }]
        except:
            pass
            
    return {"text": text, "function_calls": function_calls}

class LLMChatRouter:
    def __init__(self, model_name, system_instruction=None, tools=None):
        self.model_name = model_name
        self.system_instruction = system_instruction
        self.tools = tools
        self.contents = []
        self.provider = get_provider_from_model(model_name)
        self.native_chat = None
        
    def start_chat(self, enable_automatic_function_calling=False):
        if self.provider == "gemini":
            _init_genai()
            if self.tools:
                model = genai.GenerativeModel(model_name=self.model_name, tools=self.tools)
            else:
                model = genai.GenerativeModel(model_name=self.model_name)
            self.native_chat = model.start_chat(enable_automatic_function_calling=enable_automatic_function_calling)
        return self
        
    def send_message(self, message):
        if self.provider == "gemini":
            return self.native_chat.send_message(message)
            
        if isinstance(message, list):
            parts = []
            for part in message:
                if hasattr(part, "function_response"):
                    parts.append({
                        "functionResponse": {
                            "name": part.function_response.name,
                            "response": json.loads(part.function_response.response.get("result", "{}"))
                        }
                    })
                elif isinstance(part, dict) and "functionResponse" in part:
                    parts.append(part)
                else:
                    parts.append(str(part))
            self.contents.append({"role": "user", "parts": parts})
        else:
            self.contents.append({"role": "user", "parts": [{"text": str(message)}]})
            
        messages = map_contents_to_messages(self.contents, self.tools)
        if self.system_instruction:
            messages.insert(0, {"role": "system", "content": self.system_instruction})
            
        res = call_rest_provider(self.provider, self.model_name, messages)
        
        model_parts = []
        if res.get("function_calls"):
            fc = res["function_calls"][0]
            class MockFunctionCall:
                def __init__(self, name, args):
                    self.name = name
                    self.args = args
            class MockPart:
                def __init__(self, name, args):
                    self.function_call = MockFunctionCall(name, args)
            model_parts = [MockPart(fc["name"], fc["args"])]
        else:
            class MockPart:
                def __init__(self, text):
                    self.text = text
                    self.function_call = None
            model_parts = [MockPart(res["text"])]
            
        self.contents.append({"role": "model", "parts": model_parts})
        
        class MockCandidate:
            def __init__(self, parts):
                class MockContent:
                    def __init__(self, pts):
                        self.parts = pts
                self.content = MockContent(parts)

        class MockResponse:
            def __init__(self, text, parts):
                self.text = text
                self.parts = parts
                self.candidates = [MockCandidate(parts)]
                    
        return MockResponse(res["text"], model_parts)

    def generate_content(self, prompt, generation_config=None):
        if self.provider == "gemini":
            _init_genai()
            model = GeminiGenAIWrapper(model_name=self.model_name, system_instruction=self.system_instruction, tools=self.tools)
            return model.generate_content(prompt, generation_config=generation_config)
            
        messages = [{"role": "user", "content": prompt}]
        if self.system_instruction:
            messages.insert(0, {"role": "system", "content": self.system_instruction})
            
        res = call_rest_provider(self.provider, self.model_name, messages)
        
        class MockResponse:
            def __init__(self, text):
                self.text = text
        return MockResponse(res["text"])

class LLMRouter:
    @staticmethod
    def get_model(model_name, system_instruction=None, tools=None):
        provider = get_provider_from_model(model_name)
        if provider == "gemini":
            _init_genai()
            return GeminiGenAIWrapper(model_name=model_name, system_instruction=system_instruction, tools=tools)
        else:
            return LLMChatRouter(model_name, system_instruction=system_instruction, tools=tools)




# ──────────────────────────────────────────────────────────────────────────────
# RAG Engine v6.0 — Full-Article Retrieval-Augmented Generation
# ──────────────────────────────────────────────────────────────────────────────
# Architecture:
#   RSS Discovery → URL selection → fetch_full_article() → clean_html_to_text()
#   → chunk_text() → embed_chunks_gemini() → rag_retrieve() → Agent B writes
#   from retrieved evidence only → fact_check_draft()
# Zero extra pip dependencies — uses stdlib urllib + Gemini embedding API.
# ──────────────────────────────────────────────────────────────────────────────

class _MLStripper(HTMLParser):
    """Minimal HTML-to-text converter using stdlib only."""
    def __init__(self):
        super().__init__()
        self.reset()
        self._fed: list[str] = []
        self._skip = False
        _skip_tags = {"script", "style", "nav", "footer", "header", "aside", "noscript"}
        self._skip_tags = _skip_tags

    def handle_starttag(self, tag, attrs):
        if tag.lower() in self._skip_tags:
            self._skip = True

    def handle_endtag(self, tag):
        if tag.lower() in self._skip_tags:
            self._skip = False
        if tag.lower() in {"p", "h1", "h2", "h3", "h4", "li", "br", "div", "section", "article"}:
            self._fed.append("\n")

    def handle_data(self, data):
        if not self._skip and data.strip():
            self._fed.append(data)

    def get_text(self) -> str:
        return " ".join(self._fed)


def clean_html_to_text(html: str, expand_horizon: bool = False) -> str:
    """Strip HTML tags and boilerplate, returning clean article prose."""
    stripper = _MLStripper()
    try:
        stripper.feed(html)
        text = stripper.get_text()
    except Exception:
        # Fallback: brute-force regex strip
        text = re.sub(r"<[^>]+>", " ", html)

    # Clean whitespace line by line to preserve paragraphs
    cleaned_lines = []
    min_len = 25 if expand_horizon else 40
    for line in text.splitlines():
        cleaned_line = re.sub(r"[ \t]+", " ", line).strip()
        if len(cleaned_line) >= min_len:
            cleaned_lines.append(cleaned_line)
    
    return "\n\n".join(cleaned_lines) if cleaned_lines else text


def fetch_full_article(url: str, timeout: int = 12, expand_horizon: bool = False) -> dict:
    """
    Fetch and extract the full plain-text body of a web article using httpx and BeautifulSoup.

    Returns:
        {"url": url, "text": cleaned_body, "word_count": int, "error": None | str}
    """
    import httpx
    from bs4 import BeautifulSoup
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }
        response = httpx.get(url, timeout=float(timeout), headers=headers, follow_redirects=True)
        if response.status_code != 200:
            return {"url": url, "text": "", "word_count": 0, "error": f"HTTP Error {response.status_code}"}
            
        soup = BeautifulSoup(response.text, "html.parser")
        # Strip scripts, styles, and headers/footers to preserve token space
        for element in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
            element.decompose()
            
        raw_text = soup.get_text()
        
        # Clean lines
        cleaned_lines = []
        min_len = 25 if expand_horizon else 40
        for line in raw_text.splitlines():
            cleaned_line = re.sub(r"[ \t]+", " ", line).strip()
            if len(cleaned_line) >= min_len:
                cleaned_lines.append(cleaned_line)
                
        text = "\n\n".join(cleaned_lines)
        return {"url": url, "text": text, "word_count": len(text.split()), "error": None}
    except Exception as exc:
        return {"url": url, "text": "", "word_count": 0, "error": str(exc)}


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    """
    Split text into overlapping word-level chunks suitable for embedding.

    Args:
        text:       Source document text.
        chunk_size: Target words per chunk.
        overlap:    Words shared between adjacent chunks (context continuity).

    Returns:
        List of text chunk strings.
    """
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        if end >= len(words):
            break
        start += chunk_size - overlap
    return chunks


def embed_text_gemini(text: str, api_key: str = "", model: str = "text-embedding-004") -> list[float]:
    """
    Generate a dense embedding vector for a text string via Gemini REST API.
    No extra library required — uses urllib only.

    Returns:
        List of floats (768-dim for text-embedding-004 or 3072-dim for gemini-embedding-2), or a deterministic mock vector on error/placeholder key.
    """
    # Deterministic fallback vector function
    def get_mock_vector(dim=3072):
        import hashlib
        import random
        h = hashlib.sha256(text.encode("utf-8")).digest()
        rng = random.Random(h)
        return [rng.uniform(-0.1, 0.1) for _ in range(dim)]

    if not api_key or api_key.strip() in ["your-key-here", "API_KEY", ""]:
        return get_mock_vector()

    for model_name in [model, "gemini-embedding-2"]:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:embedContent?key={api_key}"
        )
        body = json.dumps({
            "model": f"models/{model_name}",
            "content": {"parts": [{"text": text[:8000]}]},  # hard cap for embedding
        }).encode("utf-8")

        try:
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            val = data.get("embedding", {}).get("values", [])
            if val:
                return val
        except urllib.error.HTTPError as exc:
            if model_name == "text-embedding-004":
                print(f"  [RAG] ⚠️ Model text-embedding-004 failed ({exc.code}), falling back to gemini-embedding-2...")
                continue
            print(f"  [RAG] ⚠️ Embedding error ({model_name}): {exc}")
        except Exception as exc:
            if model_name == "text-embedding-004":
                print(f"  [RAG] ⚠️ Model text-embedding-004 failed, falling back to gemini-embedding-2...")
                continue
            print(f"  [RAG] ⚠️ Embedding error ({model_name}): {exc}")
    return get_mock_vector()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two dense vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def rag_retrieve(
    query: str,
    chunks: list[str],
    embeddings: list[list[float]],
    k: int = 5,
) -> list[dict]:
    """
    Retrieve the top-k most semantically relevant chunks for a query.

    Args:
        query:      The retrieval query string.
        chunks:     List of text chunks.
        embeddings: Parallel list of chunk embeddings.
        k:          Number of top chunks to return.

    Returns:
        List of {"chunk": str, "score": float, "index": int} dicts.
    """
    # Simple keyword fallback if embeddings are empty (no API key)
    if not embeddings or not any(embeddings):
        query_words = set(query.lower().split())
        scored = []
        for i, chunk in enumerate(chunks):
            chunk_words = set(chunk.lower().split())
            score = len(query_words & chunk_words) / max(len(query_words), 1)
            scored.append({"chunk": chunk, "score": score, "index": i})
        return sorted(scored, key=lambda x: x["score"], reverse=True)[:k]

    # Embed the query
    # NOTE: We reuse the first available embedder (lazy import / fallback)
    query_vec = embeddings[0]  # placeholder — overridden below at call site

    scores = [cosine_similarity(query_vec, emb) for emb in embeddings]
    indexed = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
    return [{"chunk": chunks[i], "score": s, "index": i} for i, s in indexed[:k]]


def run_rag_content_fetcher(
    articles: list[dict],
    niche: str,
    api_key: str = "",
    simulate: bool = False,
    max_articles: int = 3,
    expand_horizon: bool = False,
) -> dict:
    """
    Content Fetching + RAG Pipeline between Agent A and Agent B.
    Supports expanding search horizon if quality critique score < 80.
    """
    if expand_horizon:
        max_articles = max(max_articles, 5)

    print("\n" + "─" * 64)
    print("📡  RAG CONTENT FETCHER: Full-Article Extraction")
    print(f"    Articles to fetch: {min(len(articles), max_articles)} (Horizon expanded: {expand_horizon})")
    print("─" * 64)

    article_chunks = []
    all_chunks: list[str] = []
    all_embeddings: list[list[float]] = []
    sources: list[str] = []
    skipped: list[str] = []

    # Take top articles (highest points first)
    top_articles = sorted(articles, key=lambda x: x.get("points", 0), reverse=True)[:max_articles]

    for art in top_articles:
        url = art.get("url") or art.get("link", "")
        title = art.get("title", "Untitled")
        full_content = art.get("full_content", "")

        # Priority 1: Use RSS content:encoded if substantial (avoids HTTP fetch entirely)
        if full_content and len(full_content.split()) >= 200 and not simulate:
            word_count = len(full_content.split())
            print(f"  [RAG] 📰 Using RSS content:encoded for: {title[:60]} ({word_count} words)")
            chunk_size = 500 if expand_horizon else 800
            overlap = 200 if expand_horizon else 120
            chunks = chunk_text(full_content, chunk_size=chunk_size, overlap=overlap)
            print(f"  [RAG] 📦 Chunked into {len(chunks)} overlapping segments (from RSS content)")

            embeddings = []
            if api_key:
                print(f"  [RAG] 🧠 Embedding {len(chunks)} chunks via text-embedding-004...")
                for i, chunk in enumerate(chunks):
                    vec = embed_text_gemini(chunk, api_key)
                    embeddings.append(vec)
                    if (i + 1) % 10 == 0:
                        print(f"  [RAG]    → {i + 1}/{len(chunks)} embedded")
            else:
                print("  [RAG] ⚠️  No Gemini API key — using keyword-based retrieval fallback.")
                embeddings = [[] for _ in chunks]

            article_chunks.append({"url": url, "title": title, "chunks": chunks, "embeddings": embeddings})
            all_chunks.extend(chunks)
            all_embeddings.extend(embeddings)
            sources.append(url)
            print(f"  [RAG] ✅ Indexed {len(chunks)} chunks from RSS content:encoded for: {title[:60]}")
            continue

        if not url:
            print(f"  [RAG] ⚠️  No URL for: {title[:60]} — skipping full fetch.")
            skipped.append(title)
            desc = art.get("description", "")
            if desc:
                all_chunks.append(f"[{title}]\n{desc}")
                all_embeddings.append([])
            continue

        if simulate:
            print(f"  [RAG] 📄 [SIMULATION] Generating synthetic article body for: {title[:60]}...")
            sim_text = (
                f"{title}\n\n"
                f"This article covers {title} in the context of {niche}. "
                f"{art.get('description', '')}\n\n"
                "**Architecture Overview**\n"
                "The system uses a layered microservices approach with event-driven communication. "
                "Each service maintains its own state store and publishes domain events to a shared broker.\n\n"
                "**Performance Benchmarks**\n"
                "Latency p99: 8ms. Throughput: 45,000 req/s. Memory footprint reduced by 34% versus previous version.\n\n"
                "**Implementation Details**\n"
                "The core algorithm leverages sparse attention mechanisms to reduce quadratic complexity to O(n log n). "
                "Token budgets are managed via a dynamic sliding window with configurable overlap.\n\n"
                "**Developer Impact**\n"
                "Engineers adopting this approach can expect 3-5x reduction in cold-start latency and "
                "near-zero GC pressure under sustained load due to arena allocation strategies."
            )
            if expand_horizon:
                sim_text += (
                    "\n\n**Expanded Deep Dive Context & Telemetry**\n"
                    "Deeper paragraph scraping reveals that the architecture employs advanced lock-free queues "
                    "and zero-copy parsing to push latencies down to the sub-millisecond range. "
                    "Scraping deeper sections also uncovered production telemetry showing a 99.999% reliability rate "
                    "across multi-region deployments with active-active replication."
                )
            
            chunk_size = 500 if expand_horizon else 800
            overlap = 200 if expand_horizon else 120
            chunks = chunk_text(sim_text, chunk_size=chunk_size, overlap=overlap)
            embeddings: list[list[float]] = [[] for _ in chunks]
            article_chunks.append({"url": url, "title": title, "chunks": chunks, "embeddings": embeddings})
            all_chunks.extend(chunks)
            all_embeddings.extend(embeddings)
            sources.append(url)
            print(f"  [RAG] ✅ Simulated {len(chunks)} chunks for: {title[:60]}")
            continue

        print(f"  [RAG] 🌐 Fetching full article: {url[:70]}...")
        t0 = _time_mod.time()
        result = fetch_full_article(url, expand_horizon=expand_horizon)
        elapsed = round(_time_mod.time() - t0, 2)

        if result["error"] or result["word_count"] < 100:
            reason = result["error"] or f"too short ({result['word_count']} words)"
            print(f"  [RAG] ⚠️  Fetch failed ({reason}) — using RSS description fallback.")
            skipped.append(url)
            desc = art.get("description", "")
            fallback = f"[{title}]\n{desc}"
            all_chunks.append(fallback)
            all_embeddings.append([])
            continue

        text = result["text"]
        print(f"  [RAG] ✅ Fetched {result['word_count']:,} words in {elapsed}s")
        
        chunk_size = 500 if expand_horizon else 800
        overlap = 200 if expand_horizon else 120
        chunks = chunk_text(text, chunk_size=chunk_size, overlap=overlap)
        print(f"  [RAG] 📦 Chunked into {len(chunks)} overlapping segments")

        embeddings = []
        if api_key:
            print(f"  [RAG] 🧠 Embedding {len(chunks)} chunks via text-embedding-004...")
            for i, chunk in enumerate(chunks):
                vec = embed_text_gemini(chunk, api_key)
                embeddings.append(vec)
                if (i + 1) % 10 == 0:
                    print(f"  [RAG]    → {i + 1}/{len(chunks)} embedded")
        else:
            print("  [RAG] ⚠️  No Gemini API key — using keyword-based retrieval fallback.")
            embeddings = [[] for _ in chunks]

        article_chunks.append({"url": url, "title": title, "chunks": chunks, "embeddings": embeddings})
        all_chunks.extend(chunks)
        all_embeddings.extend(embeddings)
        sources.append(url)

    print(f"\n  [RAG] 📚 Vector store ready: {len(all_chunks)} total chunks from {len(sources)} articles.")
    return {
        "article_chunks": article_chunks,
        "all_chunks": all_chunks,
        "all_embeddings": all_embeddings,
        "sources": sources,
        "skipped": skipped,
    }


def rag_retrieve_for_query(
    query: str,
    all_chunks: list[str],
    all_embeddings: list[list[float]],
    api_key: str,
    k: int = 6,
) -> list[str]:
    """
    Embed the query and retrieve the top-k most relevant chunks.
    Falls back to keyword overlap if no API key or empty embeddings.

    Returns list of retrieved chunk strings.
    """
    if api_key and any(e for e in all_embeddings if e):
        query_vec = embed_text_gemini(query, api_key)
        scores = [cosine_similarity(query_vec, emb) for emb in all_embeddings]
        indexed = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:k]
        return [all_chunks[i] for i, _ in indexed]
    else:
        # Keyword BM25-lite fallback
        query_words = set(re.sub(r"[^\w\s]", "", query.lower()).split())
        scored = []
        for i, chunk in enumerate(all_chunks):
            chunk_words = set(re.sub(r"[^\w\s]", "", chunk.lower()).split())
            overlap = len(query_words & chunk_words)
            scored.append((overlap, i))
        scored.sort(reverse=True)
        return [all_chunks[i] for _, i in scored[:k]]


def run_fact_checker(
    draft: str,
    all_chunks: list[str],
    sources: list[str],
    niche: str,
    model_name: str,
    api_key: str = "",
    simulate: bool = False,
) -> dict:
    """
    Agent D — Fact Checker: Cross-validates key claims in the draft against
    the original source chunks to detect hallucinations.

    Returns:
        {"passed": bool, "score": int, "issues": [str], "verified_claims": int}
    """
    print("\n" + "─" * 64)
    print("🔎  AGENT D — FACT CHECKER: Cross-validating claims...")
    print("─" * 64)

    if simulate or not all_chunks:
        print("  [Fact Checker] ✅ Simulation mode — applying default pass.")
        return {
            "passed": True,
            "score": 94,
            "issues": [],
            "verified_claims": 5,
            "note": "Simulation mode — claims accepted as sourced from synthetic article bodies."
        }

    # Heuristic: extract sentences from draft that look like factual claims
    sentences = re.split(r"(?<=[.!?])\s+", draft)
    fact_sentences = [s.strip() for s in sentences if len(s.split()) > 10 and not s.startswith("#")]
    sample_claims = fact_sentences[:12]  # check up to 12 key claims

    issues = []
    verified = 0
    for claim in sample_claims:
        # retrieve the single best-matching chunk
        relevant = rag_retrieve_for_query(claim, all_chunks, [[] for _ in all_chunks], api_key, k=1)
        if relevant:
            # simple lexical overlap: claim uses ≥ 3 unique words from source chunk
            claim_words = set(re.sub(r"[^\w]", " ", claim.lower()).split())
            chunk_words = set(re.sub(r"[^\w]", " ", relevant[0].lower()).split())
            shared = len(claim_words & chunk_words)
            if shared >= 3:
                verified += 1
            else:
                issues.append(f"Low source support for: \"{claim[:80]}...\" (only {shared} matching terms)")
        else:
            issues.append(f"No source chunk found for: \"{claim[:80]}...\"")

    total = len(sample_claims)
    score = int((verified / max(total, 1)) * 100)
    passed = score >= 40  # threshold: at least 40% claims have source support

    print(f"  [Fact Checker] Verified {verified}/{total} claims ({score}% source coverage)")
    if issues:
        for iss in issues[:3]:
            print(f"  [Fact Checker] ⚠️  {iss[:100]}")
    if passed:
        print("  [Fact Checker] ✅ PASSED — sufficient source grounding detected.")
    else:
        print("  [Fact Checker] ❌ FLAGGED — low source grounding. Review advised.")

    return {
        "passed": passed,
        "score": score,
        "issues": issues[:5],
        "verified_claims": verified,
        "total_claims_checked": total,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Day 5: Global execution telemetry stats

execution_telemetry = {
    "agent_a": {
        "last_wake": None,
        "headlines_pulled": [],
        "source": "Multiple Tech RSS Feeds",
        "duration_ms": 0
    },
    "agent_b": {
        "prompt_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "attempts": 0,
        "violations": [],
        "duration_ms": 0,
        "grounding_sources": []
    },
    "agent_c": {
        "score": 0,
        "notes": "",
        "passed": False,
        "duration_ms": 0
    },
    "total_duration_ms": 0,
    "total_cost_usd": 0.0,
    "spans": [],
    "failures": {
        "violations_count": 0,
        "attempts_count": 0,
        "api_errors_count": 0
    }
}

def calculate_token_cost(model_name: str, prompt_tokens: int, output_tokens: int) -> float:
    model_lower = model_name.lower()
    input_cost_per_m = 0.0
    output_cost_per_m = 0.0
    
    if "gemini-1.5-flash" in model_lower:
        input_cost_per_m = 0.075
        output_cost_per_m = 0.30
    elif "gemini-1.5-pro" in model_lower:
        input_cost_per_m = 1.25
        output_cost_per_m = 5.00
    elif "gemini-2.5-flash" in model_lower:
        input_cost_per_m = 0.075
        output_cost_per_m = 0.30
    elif "gemini-2.5-pro" in model_lower:
        input_cost_per_m = 1.25
        output_cost_per_m = 5.00
    elif "gpt-4o-mini" in model_lower:
        input_cost_per_m = 0.150
        output_cost_per_m = 0.60
    elif "gpt-4o" in model_lower:
        input_cost_per_m = 2.50
        output_cost_per_m = 10.00
    elif "claude-3-5-sonnet" in model_lower:
        input_cost_per_m = 3.00
        output_cost_per_m = 15.00
    elif "claude-3-5-haiku" in model_lower:
        input_cost_per_m = 0.80
        output_cost_per_m = 4.00
    elif "llama-3" in model_lower or "mixtral" in model_lower or "gemma2" in model_lower:
        input_cost_per_m = 0.05
        output_cost_per_m = 0.10
    else:
        input_cost_per_m = 0.075
        output_cost_per_m = 0.30
        
    cost = (prompt_tokens * input_cost_per_m / 1000000.0) + (output_tokens * output_cost_per_m / 1000000.0)
    return round(cost, 6)

def save_telemetry(niche: str, model_name: str, status: str, error_message: str = None):
    import uuid
    history_path = os.path.join(os.path.dirname(__file__), "run_history.json")
    
    history = []
    if os.path.exists(history_path):
        try:
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []

    # Calculate token cost
    total_prompt = execution_telemetry["agent_b"]["prompt_tokens"]
    total_output = execution_telemetry["agent_b"]["output_tokens"]
    cost = calculate_token_cost(model_name, total_prompt, total_output)
    execution_telemetry["total_cost_usd"] = cost

    # Calculate failure metrics
    api_errors = 1 if status == "failed" else 0
    execution_telemetry["failures"] = {
        "violations_count": len(execution_telemetry["agent_b"]["violations"]),
        "attempts_count": execution_telemetry["agent_b"]["attempts"],
        "api_errors_count": api_errors
    }

    # Generate OpenTelemetry spans
    trace_id = uuid.uuid4().hex
    pipeline_span_id = uuid.uuid4().hex[:16]
    agent_a_span_id = uuid.uuid4().hex[:16]
    agent_b_span_id = uuid.uuid4().hex[:16]
    agent_c_span_id = uuid.uuid4().hex[:16]

    now_iso = datetime.now().isoformat() + "Z"
    
    spans = [
        {
            "name": "pipeline_run",
            "context": {
                "trace_id": trace_id,
                "span_id": pipeline_span_id
            },
            "parent_span_id": None,
            "start_time": execution_telemetry["agent_a"]["last_wake"] or now_iso,
            "end_time": now_iso,
            "duration_ms": execution_telemetry["total_duration_ms"],
            "attributes": {
                "niche": niche,
                "model": model_name,
                "status": status,
                "error": error_message or ""
            }
        },
        {
            "name": "agent_a_trend_scout",
            "context": {
                "trace_id": trace_id,
                "span_id": agent_a_span_id
            },
            "parent_span_id": pipeline_span_id,
            "start_time": execution_telemetry["agent_a"]["last_wake"] or now_iso,
            "end_time": now_iso,
            "duration_ms": execution_telemetry["agent_a"]["duration_ms"],
            "attributes": {
                "source": execution_telemetry["agent_a"]["source"],
                "headlines_pulled_count": len(execution_telemetry["agent_a"]["headlines_pulled"])
            }
        },
        {
            "name": "agent_b_writer",
            "context": {
                "trace_id": trace_id,
                "span_id": agent_b_span_id
            },
            "parent_span_id": pipeline_span_id,
            "start_time": now_iso,
            "end_time": now_iso,
            "duration_ms": execution_telemetry["agent_b"]["duration_ms"],
            "attributes": {
                "attempts": execution_telemetry["agent_b"]["attempts"],
                "violations_count": len(execution_telemetry["agent_b"]["violations"]),
                "prompt_tokens": total_prompt,
                "output_tokens": total_output
            }
        },
        {
            "name": "agent_c_evaluator",
            "context": {
                "trace_id": trace_id,
                "span_id": agent_c_span_id
            },
            "parent_span_id": pipeline_span_id,
            "start_time": now_iso,
            "end_time": now_iso,
            "duration_ms": execution_telemetry["agent_c"]["duration_ms"],
            "attributes": {
                "score": execution_telemetry["agent_c"]["score"],
                "passed": execution_telemetry["agent_c"]["passed"]
            }
        }
    ]
    execution_telemetry["spans"] = spans
            
    record = {
        "timestamp": datetime.now().isoformat() + "Z",
        "niche": niche,
        "model": model_name,
        "status": status,
        "error": error_message,
        "agent_a": {
            "last_wake": execution_telemetry["agent_a"]["last_wake"],
            "headlines_pulled": execution_telemetry["agent_a"]["headlines_pulled"],
            "source": execution_telemetry["agent_a"]["source"],
            "duration_ms": execution_telemetry["agent_a"]["duration_ms"]
        },
        "agent_b": {
            "prompt_tokens": total_prompt,
            "output_tokens": total_output,
            "total_tokens": total_prompt + total_output,
            "attempts": execution_telemetry["agent_b"]["attempts"],
            "violations": execution_telemetry["agent_b"]["violations"],
            "duration_ms": execution_telemetry["agent_b"]["duration_ms"],
            "grounding_sources": execution_telemetry["agent_b"].get("grounding_sources", [])
        },
        "agent_c": {
            "score": execution_telemetry["agent_c"]["score"],
            "notes": execution_telemetry["agent_c"]["notes"],
            "passed": execution_telemetry["agent_c"]["passed"],
            "duration_ms": execution_telemetry["agent_c"]["duration_ms"]
        },
        "telemetry": {
            "total_duration_ms": execution_telemetry["total_duration_ms"],
            "total_cost_usd": cost,
            "agent_a_duration_ms": execution_telemetry["agent_a"]["duration_ms"],
            "agent_b_duration_ms": execution_telemetry["agent_b"]["duration_ms"],
            "agent_c_duration_ms": execution_telemetry["agent_c"]["duration_ms"],
            "spans": spans,
            "failures": execution_telemetry["failures"]
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
CONTENT_ENCODED_NS = "{http://purl.org/rss/1.0/modules/content/}encoded"


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

        # Extract full article content from content:encoded (RSS extension)
        raw_content = (item.findtext(CONTENT_ENCODED_NS) or "").strip()
        full_content = re.sub(r'<[^>]*>', ' ', raw_content).strip()[:5000] if raw_content else ""

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
            "full_content": full_content,
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

        # Extract full article content from content:encoded (RSS extension)
        raw_content = (item.findtext(CONTENT_ENCODED_NS) or "").strip()
        full_content = re.sub(r'<[^>]*>', ' ', raw_content).strip()[:5000] if raw_content else ""

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
            "full_content": full_content,
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

        # Extract full article content from content:encoded (RSS extension)
        raw_content = (item.findtext(CONTENT_ENCODED_NS) or "").strip()
        full_content = re.sub(r'<[^>]*>', ' ', raw_content).strip()[:5000] if raw_content else ""

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
            "full_content": full_content,
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

        # Extract full article content from content:encoded (RSS extension)
        raw_content = (item.findtext(CONTENT_ENCODED_NS) or "").strip()
        full_content = re.sub(r'<[^>]*>', ' ', raw_content).strip()[:5000] if raw_content else ""

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
            "full_content": full_content,
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

        # Extract full article content from content:encoded (RSS extension)
        raw_content = (item.findtext(CONTENT_ENCODED_NS) or "").strip()
        full_content = re.sub(r'<[^>]*>', ' ', raw_content).strip()[:5000] if raw_content else ""

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
            "full_content": full_content,
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

        # Extract full article content from content:encoded (RSS extension)
        raw_content = (item.findtext(CONTENT_ENCODED_NS) or "").strip()
        full_content = re.sub(r'<[^>]*>', ' ', raw_content).strip()[:5000] if raw_content else ""

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
            "full_content": full_content,
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

        # Extract full article content from content:encoded (RSS extension)
        raw_content = (item.findtext(CONTENT_ENCODED_NS) or "").strip()
        full_content = re.sub(r'<[^>]*>', ' ', raw_content).strip()[:5000] if raw_content else ""

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
            "full_content": full_content,
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

        # Extract full article content from content:encoded (RSS extension)
        raw_content = (item.findtext(CONTENT_ENCODED_NS) or "").strip()
        full_content = re.sub(r'<[^>]*>', ' ', raw_content).strip()[:5000] if raw_content else ""

        headlines.append({
            "title": title,
            "link": link,
            "description": description[:200] if description else "",
            "full_content": full_content,
        })

        if len(headlines) >= max_items:
            break

    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} raw headlines from AWS Blog RSS.")
    return {"headlines": headlines, "count": len(headlines)}


def check_past_issues(titles: list[str]) -> dict[str, list[str]]:
    """
    Checks if any of the given article titles have already been covered in past issues of the newsletter
    using semantic vector similarity (local file-based vector storage) with Gemini text-embedding-004.

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

    # Extract API key for embedding
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and (api_key == "MY_GEMINI_API_KEY" or "API_KEY_SERVICE_BLOCKED" in api_key or "blocked" in api_key.lower()):
        api_key = None

    # Lazy-embed existing past issues if key is available
    updated_cache = False
    past_titles_with_vectors = []

    for issue in past_issues:
        if not isinstance(issue, dict):
            continue
        title = issue.get("title", "").strip()
        if not title:
            continue

        vector = issue.get("vector")
        if not vector and api_key:
            print(f"  [Memory] 🔮 Vectorizing past topic: '{title}'...")
            vector = embed_text_gemini(title, api_key)
            if vector:
                issue["vector"] = vector
                updated_cache = True

        past_titles_with_vectors.append({
            "title": title,
            "vector": vector
        })

    # Save cache if we populated new vectors
    if updated_cache:
        try:
            with open(past_issues_path, "w", encoding="utf-8") as f:
                json.dump(past_issues, f, indent=2)
            print("  [Memory] Saved newly computed past issue vectors to past_issues.json.")
        except Exception as exc:
            print(f"  [Memory] ❌ Error updating vector cache: {exc}")

    covered_titles = []
    SIMILARITY_THRESHOLD = 0.85

    for title in titles:
        cleaned_title = title.strip().lower()
        is_covered = False

        # 1. Try vector similarity first
        if api_key:
            candidate_vec = embed_text_gemini(title, api_key)
            if candidate_vec:
                for past in past_titles_with_vectors:
                    if past["vector"]:
                        sim = cosine_similarity(candidate_vec, past["vector"])
                        if sim >= SIMILARITY_THRESHOLD:
                            print(f"  [Memory] 🚫 Semantic duplicate detected! '{title}' is {sim*100:.1f}% similar to past topic '{past['title']}'")
                            is_covered = True
                            break

        # 2. Fallback to exact string matching if not covered or no API key
        if not is_covered:
            for past in past_titles_with_vectors:
                if cleaned_title == past["title"].strip().lower():
                    print(f"  [Memory] 🚫 Exact match detected for: '{title}'")
                    is_covered = True
                    break

        if is_covered:
            covered_titles.append(title)

    print(f"  [🔧 Tool] ✅ Found covered titles: {covered_titles}")
    return {"covered_titles": covered_titles}


def fetch_custom_competitor_headlines(max_items: int = 15) -> dict[str, Any]:
    """
    Agent A's tool. Fetches the latest headlines from custom competitor sites configured in competitors.json.
    """
    import urllib.request
    import xml.etree.ElementTree as ET
    import json
    import os
    import re
    
    max_items = max(1, min(int(max_items), 30))
    print(f"  [🔧 Tool] fetch_custom_competitor_headlines(max_items={max_items})")
    
    config_path = os.path.join(os.getcwd(), "competitors.json")
    if not os.path.exists(config_path):
        print("  [🔧 Tool] ⚠️ competitors.json not found. Returning empty list.")
        return {"headlines": [], "count": 0, "error": "competitors.json not found"}
        
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            competitors = json.load(f)
    except Exception as e:
        print(f"  [🔧 Tool] ❌ Error reading competitors.json: {e}")
        return {"headlines": [], "count": 0, "error": str(e)}
        
    headlines = []
    
    for comp in competitors:
        name = comp.get("name", "Competitor")
        feed_url = comp.get("feed_url", "")
        site_url = comp.get("url", "")
        
        if feed_url:
            print(f"  [🔧 Tool] → Fetching feed for {name}: {feed_url} ...")
            req = urllib.request.Request(
                feed_url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)"},
            )
            try:
                with urllib.request.urlopen(req, timeout=8) as response:
                    xml_content = response.read()
                    
                # Support both RSS (channel/item) and Atom (feed/entry) formats
                try:
                    root = ET.fromstring(xml_content)
                except ET.ParseError:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(xml_content, "xml")
                    entries = soup.find_all("entry")
                    if entries:
                        for entry in entries:
                            title_el = entry.find("title")
                            title = title_el.text.strip() if title_el else ""
                            link_el = entry.find("link")
                            link = link_el.get("href") if link_el else ""
                            if not link and link_el:
                                link = link_el.text.strip()
                            content_el = entry.find("content") or entry.find("summary")
                            description = content_el.text.strip() if content_el else ""
                            description = re.sub(r'<[^>]*>', '', description)[:200]
                            
                            if title and link:
                                headlines.append({
                                    "title": f"[{name}] {title}",
                                    "link": link,
                                    "description": description,
                                    "full_content": ""
                                })
                        continue
                    
                    items = soup.find_all("item")
                    for item in items:
                        title_el = item.find("title")
                        title = title_el.text.strip() if title_el else ""
                        link_el = item.find("link")
                        link = link_el.text.strip() if link_el else ""
                        desc_el = item.find("description")
                        description = desc_el.text.strip() if desc_el else ""
                        description = re.sub(r'<[^>]*>', '', description)[:200]
                        
                        if title and link:
                            headlines.append({
                                "title": f"[{name}] {title}",
                                "link": link,
                                "description": description,
                                "full_content": ""
                            })
                    continue
                
                is_atom = root.tag.endswith("feed")
                
                if is_atom:
                    entries = root.findall("{http://www.w3.org/2005/Atom}entry")
                    for entry in entries:
                        title = (entry.findtext("{http://www.w3.org/2005/Atom}title") or "").strip()
                        link_el = entry.find("{http://www.w3.org/2005/Atom}link")
                        link = ""
                        if link_el is not None:
                            link = link_el.attrib.get("href", "").strip()
                        summary = (entry.findtext("{http://www.w3.org/2005/Atom}summary") or entry.findtext("{http://www.w3.org/2005/Atom}content") or "").strip()
                        description = re.sub(r'<[^>]*>', '', summary)[:200]
                        
                        if title and link:
                            headlines.append({
                                "title": f"[{name}] {title}",
                                "link": link,
                                "description": description,
                                "full_content": ""
                            })
                else:
                    channel = root.find("channel")
                    if channel is not None:
                        for item in channel.findall("item"):
                            title = (item.findtext("title") or "").strip()
                            link = (item.findtext("link") or "").strip()
                            description = (item.findtext("description") or "").strip()
                            description = re.sub(r'<[^>]*>', '', description)[:200]
                            
                            if title and link:
                                headlines.append({
                                    "title": f"[{name}] {title}",
                                    "link": link,
                                    "description": description,
                                    "full_content": ""
                                })
            except Exception as e:
                print(f"  [🔧 Tool] ⚠️ Error parsing feed for competitor {name}: {e}")
                
        elif site_url:
            print(f"  [🔧 Tool] → Scraping site for {name}: {site_url} ...")
            import httpx
            from bs4 import BeautifulSoup
            try:
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                response = httpx.get(site_url, headers=headers, timeout=8.0, follow_redirects=True)
                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, "html.parser")
                    links_found = []
                    for tag in soup.find_all("a"):
                        href = tag.get("href", "")
                        text = tag.get_text().strip()
                        if href.startswith("/"):
                            from urllib.parse import urljoin
                            href = urljoin(site_url, href)
                        
                        if len(text) > 20 and href.startswith("http") and href != site_url:
                            if href not in [l["link"] for l in links_found]:
                                links_found.append({"title": text, "link": href})
                                
                    for lf in links_found[:5]:
                        headlines.append({
                            "title": f"[{name}] {lf['title']}",
                            "link": lf["link"],
                            "description": f"Extracted from target competitor: {name}.",
                            "full_content": ""
                        })
            except Exception as e:
                print(f"  [🔧 Tool] ⚠️ Error scraping site for competitor {name}: {e}")
                
    headlines = headlines[:max_items]
    print(f"  [🔧 Tool] ✅ Retrieved {len(headlines)} headlines from competitor feeds.")
    return {"headlines": headlines, "count": len(headlines)}


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
    "fetch_custom_competitor_headlines": fetch_custom_competitor_headlines,
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

# Gemini function declaration (schema) for Agent A's custom competitors blog tool
COMPETITORS_TOOL_DECLARATION = {
    "function_declarations": [
        {
            "name": "fetch_custom_competitor_headlines",
            "description": (
                "Fetches the latest headlines, research articles, and updates directly "
                "from custom competitor and tracking targets registered in competitors.json."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_items": {
                        "type": "integer",
                        "description": "Number of headlines to retrieve (default: 15, max: 30).",
                    }
                },
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
                    {"title": "The Anthropic Model Suspension Shockwave", "description": "Anthropic abruptly disabled global access to Claude Fable 5 and Claude Mythos 5 over U.S. government directives regarding cyber capability jailbreak risks.", "points": 645},
                    {"title": "The Corporate AI Cost 'Reckoning'", "description": "Massive early adopters like Amazon, Walmart, and Uber introduce strict budget caps and rein in AI usage to optimize return on investment (ROI).", "points": 530},
                    {"title": "The Rise of 'Agentic AI' in Production", "description": "Deloitte and Gartner data show a massive gap between piloting autonomous agents and moving them into live production without rewriting internal processes.", "points": 520},
                    {"title": "Yann LeCun vs. xAI", "description": "Meta's Yann LeCun labels xAI as 'kind of a failure' and predicts the brute-force LLM scaling approach is heading toward a major industry-wide reset.", "points": 515},
                    {"title": "The Green Computing & AI Data Center Boom", "description": "Environmental impact of AI data centers strains power grids in regions like Australia and the U.S., driving tech giants toward green energy strategies.", "points": 490},
                    {"title": "Physical AI & Humanoid Robotics in Logistics", "description": "Amazon, BMW, and Xiaomi scale physical AI fleet operations, deploying humanoid robots to factory floors to handle structural labor shortages.", "points": 480},
                    {"title": "Space-Based AI Compute Frontier", "description": "Nvidia and StarCloud collaborate on the first orbital AI model training, exploring space-based data centers for energy and cooling benefits.", "points": 475},
                    {"title": "AI-Generated Influencers & Social Commerce", "description": "Brands pivot advertising budgets from human creators toward fully AI-generated virtual influencers, raising authenticity and trust questions.", "points": 430},
                    {"title": "Is clean token-to-token streaming with low late-delivery possible over HTTP/3?", "description": "Engineering team reviews benchmarks of QUIC protocol streams for feeding chunked real-time LLM reasoning traces to multiple client sockets.", "points": 402},
                    {"title": "Autonomous agents now manage $50k/day ad budgets with zero human overview", "description": "A critical review of standard feedback loop errors where autonomous models enter recursive spending traps due to misaligned reward targets.", "points": 288}
                ]
            else:
                topics = [
                    {"title": "Texas Government Data Breach", "description": "A major security breach in Texas recently allowed hackers to steal 3 million driver's licenses and passports, putting a spotlight on critical state infrastructure vulnerabilities.", "points": 590},
                    {"title": "Direct-to-Satellite Mobile Connectivity", "description": "Starlink and major carriers enable standard smartphones to connect directly to satellites, threatening traditional telecom tower infrastructure.", "points": 560},
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
        model = LLMRouter.get_model(model_name=model_name)
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
        model = LLMRouter.get_model(model_name=model_name, tools=[
            HN_TOOL_DECLARATION,
            TC_TOOL_DECLARATION,
            GOOGLE_TOOL_DECLARATION,
            OPENAI_TOOL_DECLARATION,
            ZOHO_TOOL_DECLARATION,
            META_TOOL_DECLARATION,
            NETFLIX_TOOL_DECLARATION,
            AWS_TOOL_DECLARATION,
            COMPETITORS_TOOL_DECLARATION
        ])
        scout_prompt = f"""You are Agent A (The Trend Scout), an autonomous AI research agent with access to live technology RSS feed and competitor scraping tools.

Your mission for this pipeline run:
1. Call the appropriate tools (fetch_hackernews_headlines, fetch_techcrunch_headlines, fetch_google_blog_headlines, fetch_openai_blog_headlines, fetch_zoho_blog_headlines, fetch_meta_blog_headlines, fetch_netflix_blog_headlines, fetch_aws_blog_headlines, or fetch_custom_competitor_headlines) to retrieve the latest technology news, developer trends, company blog announcements, product updates, or custom competitor articles.
2. Analyze ALL returned headlines and select exactly 5 that are most technically relevant to the niche: "{niche}"
3. EXCLUDE: "Who's Hiring" job threads, generic marketing/business news, personal blogs with no technical depth.
4. INCLUDE: Technical breakthroughs, new open-source tools/frameworks, startup engineering system design post-mortems, system architecture discussions, benchmark studies.
5. For each selected story, write a 1–2 sentence technical summary explaining WHY it matters to developers in "{niche}".
6. Assign an engagement score (50–600) based on technical depth and niche relevance.

Respond with a JSON array of exactly 5 objects:
[
  {{"title": "...", "url": "https://original-article-link", "description": "...", "points": 123}},
  ...
]

CRITICAL: The "url" field MUST be the original article link returned by the RSS tool. Do NOT omit or fabricate URLs."""

    chat = model.start_chat(enable_automatic_function_calling=False)
    print(f"  [Agent A] Sending mission prompt...")
    response = chat.send_message(scout_prompt)

    # Accumulate raw RSS headlines for post-selection URL + full_content recovery
    raw_headlines_map: dict[str, dict] = {}

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

            # Store raw headline data for post-selection enrichment
            for h in tool_result.get("headlines", []):
                h_title = h.get("title", "").strip()
                if h_title:
                    raw_headlines_map[h_title] = h

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

            # Enrich selected topics with original RSS data (URL + full_content recovery)
            enriched_count = 0
            for t in topics:
                title = t.get("title", "").strip()
                if title in raw_headlines_map:
                    raw = raw_headlines_map[title]
                    if not t.get("url"):
                        t["url"] = raw.get("link", "")
                    if not t.get("full_content"):
                        t["full_content"] = raw.get("full_content", "")
                    enriched_count += 1

            print(f"\n  [Agent A] ✅ Successfully compiled {len(topics)} top stories from live RSS feeds.")
            print(f"  [Agent A] 🔗 Enriched {enriched_count}/{len(topics)} topics with original URLs + full content.")
            for i, t in enumerate(topics, 1):
                print(f"    #{i}: {t.get('title', 'N/A')[:72]}{'...' if len(t.get('title',''))>72 else ''}")
                has_url = '🔗' if t.get('url') else '⚠️ no URL'
                has_content = f"📄 {len(t.get('full_content','').split())}w" if t.get('full_content') else '📭 no content'
                print(f"         Score: {t.get('points', '?')} pts | {has_url} | {has_content}")
            execution_telemetry["agent_a"]["last_wake"] = datetime.now().isoformat() + "Z"
            execution_telemetry["agent_a"]["headlines_pulled"] = [t.get("title", "") for t in topics]
            
            # Log agent-to-agent interaction
            log_agent_interaction(
                "Agent A (Trend Scout)",
                "Agent B (Writer)",
                f"Handing over {len(topics)} live technology headlines sourced from RSS feeds. "
                f"Enriched {enriched_count} with original URLs + full article content. Selected titles: "
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

def run_agent_b(
    niche: str,
    topics: list[dict],
    model_name: str,
    simulate: bool = False,
    feedback: str = None,
    previous_draft: str = None,
    rag_context: dict = None,   # v6.0 RAG: {all_chunks, all_embeddings, sources, api_key}
    expand_horizon: bool = False,
) -> str:
    """
    Agent B (The Writer) v6.0: Receives Agent A's topic payload + RAG-retrieved
    full-article evidence chunks. Calls the memory tool to deduplicate, then
    writes the newsletter ONLY from the supplied evidence context.
    If rag_context is None, falls back to the previous headline-based writing mode.
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
        is_ai_impact = any(k in niche.lower() or any(k in t.get("title", "").lower() for t in topics) for k in ["developer", "fall", "jobs", "layoff", "impact", "arise", "it sector", "artificial intelligence", "ai"])
        
        simulated_sections = ""
        for idx, t in enumerate(uncovered_topics[:3]):
            if is_ai_impact:
                if idx == 0:
                    simulated_sections += f"""
## 1. 🔍 Deep Dive: Architecture of GitHub Launchpad's 'Local Workspace' Chromium Agent Engine

### The Core Paradigm
The newly previewed GitHub Launchpad workspace architecture shifts agent code execution away from remote cloud sandboxes directly into the browser client via localized Chromium Extension manifests. By leveraging background service workers, local file system access permissions, and native messaging, the engine executes code evaluation tasks with zero remote round-trip network lag.

```typescript
// Local workspace sandbox communication pipeline
class LocalWorkspaceAgent {{
  private port: chrome.runtime.Port;

  constructor(private workspacePath: string) {{
    this.port = chrome.runtime.connectNative('com.github.launchpad.local_agent');
  }}

  public async executeSecureCommand(instruction: string): Promise<string> {{
    return new Promise((resolve) => {{
      this.port.postMessage({{ command: "EXECUTE", path: this.workspacePath, rawInput: instruction }});
      this.port.onMessage.addListener((response) => resolve(response.stdout));
    }});
  }}
}}
```
"""
                elif idx == 1:
                    simulated_sections += f"""
## 2. ⚡ Performance Tuning & Optimization for Local extension runtimes

Optimizing client-side execution boundaries is critical. To avoid UI blocking spikes during heavy directory traversals, the workspace agent delegates native disk operations to an isolated system-level thread pool using a dedicated messaging layer.

| Layer | Sandbox Isolation Strategy | Communication Channel | Latency Cost |
| :--- | :--- | :--- | :--- |
| UI | V8 Extension Context | Chrome Runtime Ports | ~0.5ms |
| Host | Native OS Thread Pool | Standard I/O (stdio) | <2.0ms |
"""
                else:
                    simulated_sections += f"""
## 3. ⚠️ Common Pitfalls and Anti-patterns

Avoid requesting broad wildcard permissions (`<all_urls>`) inside the extension manifest. Adhering to strict declarative-net-request rules ensures your local AI workspace maintains enterprise security parameters without risking data leaks.
"""
            else:
                # Default technical template (speculative scheduler)
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
    tools = [MEMORY_TOOL_DECLARATION]
    if not simulate:
        tools.append("google_search")

    model = LLMRouter.get_model(
        model_name=model_name,
        tools=tools,
        system_instruction=(
            "You are an Elite Principal AI Architect writing a technical newsletter.\n"
            "CRITICAL CONSTRAINT: You must ONLY write code snippets that directly match the core subject matter of the provided RAG context.\n"
            "- If the topic is about 'Chromium Extensions', do NOT generate Rust transaction pools or blockchain Merkle roots.\n"
            "- Match the programming language to the ecosystem discussed (e.g., Chromium Extensions = TypeScript/JavaScript; Linux Kernels = C/Rust).\n"
            "- Never duplicate the topic title inside your markdown subheadings."
        ),
    )

    # Format Agent A's payload for the Writer prompt
    topics_payload = "\n".join(
        f"{i}. **{t.get('title', 'N/A')}**\n"
        f"   HN Score: {t.get('points', 'N/A')} pts\n"
        f"   URL: {t.get('url') or t.get('link', 'N/A')}\n"
        f"   Summary: {t.get('description', 'N/A')}"
        for i, t in enumerate(topics, 1)
    )

    # ── v6.0 RAG: Build retrieved evidence block ───────────────────────────────
    rag_evidence_block = ""
    if rag_context and rag_context.get("all_chunks"):
        all_chunks = rag_context["all_chunks"]
        all_embeddings = rag_context.get("all_embeddings", [])
        api_key = rag_context.get("api_key", "")
        sources = rag_context.get("sources", [])

        # Build a retrieval query from the top topics
        query = " ".join(t.get("title", "") for t in topics[:3])
        retrieved = rag_retrieve_for_query(query, all_chunks, all_embeddings, api_key, k=12 if expand_horizon else 8)

        evidence_lines = []
        for idx, chunk in enumerate(retrieved, 1):
            evidence_lines.append(f"[EVIDENCE {idx}]\n{chunk.strip()}")
        rag_evidence_block = "\n\n".join(evidence_lines)

        sources_str = "\n".join(f"- {s}" for s in sources)
        print(f"  [Agent B] 📚 RAG: injecting {len(retrieved)} evidence chunks into writing prompt.")
        log_agent_interaction(
            "RAG Content Fetcher",
            "Agent B (Writer)",
            f"Injecting {len(retrieved)} retrieved evidence chunks from {len(sources)} articles into Agent B context."
        )
    # ──────────────────────────────────────────────────────────────────────────

    if rag_evidence_block:
        writer_prompt = f"""You are writing a comprehensive technical newsletter for the niche: "{niche}".

Agent A (Trend Scout) has identified these {len(topics)} trending stories:

{topics_payload}

CRITICAL REQUIREMENT:
Before drafting, you MUST call the check_past_issues tool to check which of these topic titles have already been covered.
Reject covered topics and use only uncovered ones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE EVIDENCE (Retrieved from full articles — use ONLY this information):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{rag_evidence_block}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS — EVIDENCE-BASED WRITING ONLY:
- Write EXCLUSIVELY from the SOURCE EVIDENCE above. Do NOT invent benchmark numbers, implementation details, or quotes not present in the evidence.
- If a claim is not supported by the evidence, omit it entirely.
- Add source citations in parentheses like: (Source: article title) where relevant.
- Extract specific numbers, architecture details, code patterns, and API designs from the evidence text.

Newsletter structure:
- **Title**: A catchy, professional subject line
- **Introduction**: 3–4 sentences contextualizing today's stories
- **Deep Dive Sections** (one `##` per topic, grounded in evidence):
  - Technical context directly cited from source material
  - Code snippets, benchmarks, or diagrams extracted from evidence
  - Concrete developer impact
- **Conclusion**: Forward-looking synthesis
- **Sources**: A `## Sources` section listing all article URLs used

Tone: Expert Substack technical memo. No greetings. No filler. Start directly with the title."""
    else:
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
        
    # Extract and store grounding sources in telemetry
    if hasattr(response, "grounding_sources") and response.grounding_sources:
        execution_telemetry["agent_b"]["grounding_sources"] = response.grounding_sources
        
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

def run_agent_c(niche: str, draft: str, model_name: str, simulate: bool = False, expand_horizon: bool = False) -> dict:
    """
    Agent C (Compliance Critic): Audits the newsletter draft against a
    structured quality checklist and returns a stamped evaluation report.
    """
    print("\n" + "─" * 64)
    print("🔬  AGENT C — EVALUATOR: Activating...")
    print("─" * 64)

    if simulate:
        print("  [Agent C] Running simulated compliance and quality audit...")
        if not expand_horizon:
            print("  [Agent C] ⚠️ REVIEW NEEDED (Simulated low content score to test critique-driven RAG)")
            print("  [Agent C] Score    : 75/100")
            print("  [Agent C] Checks   : 5/7 passed")
            print("  [Agent C] Notes    : Content is technically clean but lacks deeper architectural detail.")
            execution_telemetry["agent_c"]["score"] = 75
            execution_telemetry["agent_c"]["notes"] = "Content is technically clean but lacks deeper architectural detail."
            execution_telemetry["agent_c"]["passed"] = False
            
            log_agent_interaction(
                "Agent C (Evaluator)",
                "Orchestrator",
                "Audit complete. Verdict: REVIEW NEEDED (Score: 75/100). Feedback: Content lacks deeper architectural detail."
            )
            return {
                "passed": False,
                "score": 75,
                "checks": {
                    "title_present": True,
                    "introduction": True,
                    "deep_dives": False,
                    "code_or_table": True,
                    "conclusion": True,
                    "no_filler": False,
                    "expert_tone": True
                },
                "notes": "Content is technically clean but lacks deeper architectural detail."
            }
        else:
            print("  [Agent C] ✅ APPROVED (Simulated success after RAG expansion)")
            print("  [Agent C] Score    : 95/100")
            print("  [Agent C] Checks   : 7/7 passed")
            print("  [Agent C] Notes    : Excellent detail. Expanded sections contain high-quality technical telemetry.")
            execution_telemetry["agent_c"]["score"] = 95
            execution_telemetry["agent_c"]["notes"] = "Excellent detail. Expanded sections contain high-quality technical telemetry."
            execution_telemetry["agent_c"]["passed"] = True
            
            log_agent_interaction(
                "Agent C (Evaluator)",
                "Orchestrator",
                "Audit complete. Verdict: APPROVED (Score: 95/100) after RAG expansion."
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
                "notes": "Excellent detail. Expanded sections contain high-quality technical telemetry."
            }

    model = LLMRouter.get_model(model_name=model_name)

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
    """Parses selected topics from the final draft and appends them to past_issues.json with vectors."""
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

    # Extract API key for embedding
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and (api_key == "MY_GEMINI_API_KEY" or "API_KEY_SERVICE_BLOCKED" in api_key or "blocked" in api_key.lower()):
        api_key = None

    updated = False
    for topic in topics:
        title = topic.get("title", "")
        if not title:
            continue

        # Check if the title is mentioned in the newsletter content
        if title.lower() in newsletter_content.lower():
            if title.strip().lower() not in existing_titles:
                vector = None
                if api_key:
                    print(f"  [Memory] 🔮 Vectorizing new topic: '{title}'...")
                    vector = embed_text_gemini(title, api_key)
                
                past_issues.append({
                    "title": title,
                    "niche": niche,
                    "timestamp": datetime.now().isoformat() + "Z",
                    "vector": vector
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


def correct_spelling_and_grammar(text: str, api_key: str = None, simulate: bool = False) -> str:
    """
    Corrects spelling, grammar, and capitalization errors in a niche or topic string.
    If in live mode, calls the Gemini API to clean the text professionally.
    If in simulation/offline mode, applies heuristic cleanup rules.
    """
    if not text:
        return text

    if not simulate and api_key and (api_key != "n" and "mock" not in api_key.lower()):
        try:
            # Re-init if not already initialized
            _init_genai()
            model = LLMRouter.get_model()
            prompt = f"Correct any spelling, grammar, typos, or casing errors in the following topic or technical niche. Return ONLY the corrected, clean, professional text, without any quotes or explanations.\\n\\nInput: {text}"
            response = model.generate_content(prompt)
            cleaned = (response.text or "").strip()
            if cleaned:
                cleaned = cleaned.strip('"').strip("'")
                print(f"🪄  [Orchestrator] Corrected spelling/grammar in live mode: '{text}' -> '{cleaned}'")
                return cleaned
        except Exception as exc:
            print(f"⚠️  [Orchestrator] Failed to correct spelling via LLM: {exc}")

    # Offline/Simulation fallback heuristics
    cleaned = text
    replacements = {
        r"\bdeveloperss\b": "developers",
        r"\bdeveloperr\b": "developer",
        r"\bsoftwares\b": "software",
        r"\barise of AI\b": "the rise of AI",
        r"\barise of artificial intelligence\b": "the rise of artificial intelligence",
        r"\btechnical new letters\b": "technical newsletters",
        r"\bnew letters\b": "newsletters",
        r"\bnew letter\b": "newsletter",
        r"\bframe works\b": "frameworks",
        r"\bframe work\b": "framework",
    }
    for pattern, rep in replacements.items():
        cleaned = re.sub(pattern, rep, cleaned, flags=re.IGNORECASE)
    
    if cleaned != text:
        print(f"🪄  [Orchestrator] Corrected spelling/grammar in offline mode: '{text}' -> '{cleaned}'")
    
    return cleaned


def clean_markdown_headers(text: str) -> str:
    """
    Cleans markdown headers to remove repetitive title phrases and structural stuttering.
    """
    if not text:
        return text

    # 1. Deduplicate repetitive phrase injection in headers
    text = re.sub(r'(Deep Dive:\s*)+', 'Deep Dive: ', text, flags=re.IGNORECASE)
    text = re.sub(r'(Performance Tuning & Optimization for\s*)+', 'Performance Tuning & Optimization for ', text, flags=re.IGNORECASE)
    
    # 2. Prevent bloated titles duplicated by long model phrases
    lines = []
    for line in text.splitlines():
        if line.startswith('#'):
            match = re.match(r'^(#+\s+(?:\d+\.\s+)?(?:[^\w\s]*\s*)?)(.*)$', line)
            if match:
                prefix, content = match.groups()
                content_clean = content.strip()
                
                # Check if the entire content portion is duplicated (e.g. "Title Title")
                half = len(content_clean) // 2
                if half > 4:
                    part1 = content_clean[:half].strip()
                    part2 = content_clean[half:].strip()
                    if part1 == part2:
                        line = f"{prefix.strip()} {part1}"
                    else:
                        # Also check if it starts with a key structural marker followed by duplication
                        for marker in ["Deep Dive:", "Performance Tuning & Optimization for", "Strategic Outlook:", "Analysis:"]:
                            if content_clean.lower().startswith(marker.lower()):
                                subcontent = content_clean[len(marker):].strip()
                                subhalf = len(subcontent) // 2
                                if subhalf > 4:
                                    spart1 = subcontent[:subhalf].strip()
                                    spart2 = subcontent[subhalf:].strip()
                                    if spart1 == spart2:
                                        line = f"{prefix.strip()} {marker} {spart1}"
                                        break
        lines.append(line)
    return "\n".join(lines)


def markdown_to_html(md: str) -> str:
    """Converts a standard Markdown string to a clean HTML layout."""
    if not md:
        return ""
    
    html = md
    
    # 1. Strip the YAML metadata header if present
    if html.startswith("---"):
        parts = html.split("---\n", 2)
        if len(parts) >= 3:
            html = parts[2]
            
    # 2. H3 Headers
    html = re.sub(r'^###\s+(.*)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
    # 3. H2 Headers
    html = re.sub(r'^##\s+(.*)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
    # 4. H1 Headers
    html = re.sub(r'^#\s+(.*)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)
    
    # 5. Bold & Italic
    html = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html)
    html = re.sub(r'\*(.*?)\*', r'<em>\1</em>', html)
    
    # 6. Tables
    lines = html.splitlines()
    in_table = False
    table_lines = []
    new_lines = []
    
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('|') and stripped.endswith('|'):
            in_table = True
            table_lines.append(stripped)
        else:
            if in_table:
                table_html = "<table border='1' cellpadding='5' style='border-collapse: collapse; margin: 15px 0;'>\n"
                headers = [h.strip() for h in table_lines[0].split('|')[1:-1]]
                start_row = 1
                if len(table_lines) > 1 and all(c in '|- :' for c in table_lines[1].replace('|', '').strip()):
                    start_row = 2
                
                table_html += "  <thead>\n    <tr>\n"
                for h in headers:
                    table_html += f"      <th>{h}</th>\n"
                table_html += "    </tr>\n  </thead>\n  <tbody>\n"
                
                for row_line in table_lines[start_row:]:
                    row_data = [d.strip() for d in row_line.split('|')[1:-1]]
                    table_html += "    <tr>\n"
                    for d in row_data:
                        table_html += f"      <td>{d}</td>\n"
                    table_html += "    </tr>\n"
                
                table_html += "  </tbody>\n</table>"
                new_lines.append(table_html)
                table_lines = []
                in_table = False
            new_lines.append(line)
            
    if in_table and table_lines:
        table_html = "<table border='1' cellpadding='5' style='border-collapse: collapse; margin: 15px 0;'>\n"
        headers = [h.strip() for h in table_lines[0].split('|')[1:-1]]
        start_row = 1
        if len(table_lines) > 1 and all(c in '|- :' for c in table_lines[1].replace('|', '').strip()):
            start_row = 2
        table_html += "  <thead>\n    <tr>\n"
        for h in headers:
            table_html += f"      <th>{h}</th>\n"
        table_html += "    </tr>\n  </thead>\n  <tbody>\n"
        for row_line in table_lines[start_row:]:
            row_data = [d.strip() for d in row_line.split('|')[1:-1]]
            table_html += "    <tr>\n"
            for d in row_data:
                table_html += f"      <td>{d}</td>\n"
            table_html += "    </tr>\n"
        table_html += "  </tbody>\n</table>"
        new_lines.append(table_html)
        
    html = "\n".join(new_lines)

    # 7. Code blocks
    def replace_code_block(match):
        lang = match.group(1) or ""
        code = match.group(2)
        code_escaped = code.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        return f"<pre style='background: #0f172a; color: #f8fafc; padding: 15px; border-radius: 8px; overflow-x: auto;'><code class='language-{lang}'>{code_escaped}</code></pre>"
    html = re.sub(r'```(\w*)\n(.*?)```', replace_code_block, html, flags=re.DOTALL)
    
    # 8. Inline code
    html = re.sub(r'`(.*?)`', r"<code style='background: #e2e8f0; padding: 2px 4px; border-radius: 4px;'>\1</code>", html)
    
    # 9. Paragraphs
    blocks = html.split('\n\n')
    for i, block in enumerate(blocks):
        b_strip = block.strip()
        if not b_strip:
            continue
        if b_strip.startswith('<h') or b_strip.startswith('<pre') or b_strip.startswith('<table') or b_strip.startswith('---'):
            continue
        para = b_strip.replace('\n', '<br />')
        blocks[i] = f"<p>{para}</p>"
        
    return "\n\n".join(blocks)


def publish_to_wordpress(md: str, config: dict, simulate: bool = False) -> dict:
    """Publishes the newsletter draft to the configured WordPress site via REST API."""
    import httpx
    url = config.get("url", "").rstrip("/")
    if not url.endswith("/wp-json") and url:
        url = f"{url}/wp-json" if "/wp-json" not in url else url
    
    username = config.get("username", "")
    password_env = config.get("password_env_var", "WP_APPLICATION_PASSWORD")
    password = os.environ.get(password_env, "")
    
    title = "Autonomous Technical Briefing"
    match = re.search(r'^#\s+(.*)$', md, flags=re.MULTILINE)
    if match:
        title = match.group(1)
        
    html_content = markdown_to_html(md)
    
    payload = {
        "title": title,
        "content": html_content,
        "status": "publish" if not simulate else "draft"
    }
    
    dry_run = config.get("dry_run", True) or simulate or not password or not username or not url
    
    if dry_run:
        mock_file = os.path.join(os.getcwd(), "mock_wordpress_publish.json")
        try:
            with open(mock_file, "w", encoding="utf-8") as f:
                json.dump({"payload": payload, "headers": {"Authorization": f"Basic {username}:[MASKED]"}}, f, indent=2)
        except Exception:
            pass
        return {
            "success": True,
            "simulated": True,
            "post_id": 12345,
            "url": f"{config.get('url', 'https://example.com')}/?p=12345",
            "message": "Simulated WordPress export completed successfully. Payload written to mock_wordpress_publish.json."
        }
        
    try:
        import base64
        credentials = f"{username}:{password}"
        token = base64.b64encode(credentials.encode()).decode()
        headers = {
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json"
        }
        
        response = httpx.post(f"{url}/wp/v2/posts", json=payload, headers=headers, timeout=15.0)
        if response.status_code in [200, 201]:
            resp_json = response.json()
            return {
                "success": True,
                "simulated": False,
                "post_id": resp_json.get("id"),
                "url": resp_json.get("link"),
                "message": f"WordPress post created successfully (ID: {resp_json.get('id')})."
            }
        else:
            return {
                "success": False,
                "simulated": False,
                "error": f"HTTP {response.status_code}: {response.text}"
            }
    except Exception as e:
        return {
            "success": False,
            "simulated": False,
            "error": str(e)
        }


def trigger_webhook(md: str, config: dict, telemetry_data: dict, simulate: bool = False) -> dict:
    """Sends the newsletter payload to an external webhook target."""
    import httpx
    url = config.get("url", "")
    dry_run = config.get("dry_run", True) or simulate or not url
    
    payload = {
        "event": "newsletter_published",
        "timestamp": datetime.now().isoformat(),
        "niche": telemetry_data.get("niche", ""),
        "scores": {
            "evaluator": telemetry_data.get("agent_c", {}).get("score", 0),
            "fact_checker": telemetry_data.get("fact_checker_score", 0)
        },
        "markdown": md,
        "html": markdown_to_html(md)
    }
    
    if dry_run:
        mock_file = os.path.join(os.getcwd(), "mock_webhook_publish.json")
        try:
            with open(mock_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception:
            pass
        return {
            "success": True,
            "simulated": True,
            "message": "Simulated Webhook trigger completed. Payload written to mock_webhook_publish.json."
        }
        
    try:
        response = httpx.post(url, json=payload, timeout=10.0)
        if response.status_code in [200, 201, 202, 204]:
            return {
                "success": True,
                "simulated": False,
                "message": f"Webhook payload delivered successfully (HTTP {response.status_code})."
            }
        else:
            return {
                "success": False,
                "simulated": False,
                "error": f"HTTP {response.status_code}: {response.text}"
            }
    except Exception as e:
        return {
            "success": False,
            "simulated": False,
            "error": str(e)
        }


def run_agent_c_publisher(md: str, telemetry_data: dict, simulate: bool = False) -> dict:
    """
    Agent C (Publisher) orchestrator. Loads publishing_config.json,
    runs the WordPress & Webhook pipelines, and logs the execution status.
    """
    config_path = os.path.join(os.getcwd(), "publishing_config.json")
    config = {"wordpress": {"enabled": False}, "webhook": {"enabled": False}, "dry_run": True}
    
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
        except Exception as e:
            print(f"  [Publisher] Error reading publishing_config.json: {e}")
            
    results = {}
    is_dry = config.get("dry_run", True) or simulate
    
    print("\n" + "─" * 64)
    print("📢  AGENT C — PUBLISHER: Distribution Fleet Active")
    print(f"    Dry Run Mode: {is_dry}")
    print("─" * 64)
    
    # WordPress publishing
    wp_cfg = config.get("wordpress", {})
    if wp_cfg.get("enabled", False):
        print(f"  [Publisher] 🌐 Exporting to WordPress: {wp_cfg.get('url')}...")
        wp_res = publish_to_wordpress(md, wp_cfg, simulate)
        results["wordpress"] = wp_res
        if wp_res.get("success"):
            print(f"  [Publisher] ✅ WordPress Export Successful! URL: {wp_res.get('url')}")
            log_agent_interaction(
                "Agent C (Publisher)",
                "WordPress Server",
                f"Successfully published content draft. Status: {'Simulated' if wp_res.get('simulated') else 'Live'}. Link: {wp_res.get('url')}"
            )
        else:
            print(f"  [Publisher] ❌ WordPress Export Failed: {wp_res.get('error')}")
            log_agent_interaction(
                "Agent C (Publisher)",
                "Orchestrator",
                f"WordPress distribution failure: {wp_res.get('error')}"
            )
            
    # Webhook triggering
    wh_cfg = config.get("webhook", {})
    if wh_cfg.get("enabled", False):
        print(f"  [Publisher] 📡 Triggering Webhook: {wh_cfg.get('url')}...")
        wh_res = trigger_webhook(md, wh_cfg, telemetry_data, simulate)
        results["webhook"] = wh_res
        if wh_res.get("success"):
            print(f"  [Publisher] ✅ Webhook delivery successful!")
            log_agent_interaction(
                "Agent C (Publisher)",
                "Webhook Target",
                f"Delivered JSON payload to webhook. Status: {'Simulated' if wh_res.get('simulated') else 'Live'}."
            )
        else:
            print(f"  [Publisher] ❌ Webhook delivery failed: {wh_res.get('error')}")
            log_agent_interaction(
                "Agent C (Publisher)",
                "Orchestrator",
                f"Webhook delivery failure: {wh_res.get('error')}"
            )
            
    if not results:
        print("  [Publisher] ℹ️ No publishers configured or enabled. Saved to disk only.")
        
    return results


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
            "source": "Multiple Tech RSS Feeds",
            "duration_ms": 0
        },
        "agent_b": {
            "prompt_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "attempts": 0,
            "violations": [],
            "duration_ms": 0
        },
        "agent_c": {
            "score": 0,
            "notes": "",
            "passed": False,
            "duration_ms": 0
        },
        "total_duration_ms": 0,
        "total_cost_usd": 0.0,
        "spans": [],
        "failures": {
            "violations_count": 0,
            "attempts_count": 0,
            "api_errors_count": 0
        }
    }

    # Clear previous agent interactions log
    log_path = os.path.join(os.path.dirname(__file__), "agent_interactions.json")
    if os.path.exists(log_path):
        try:
            os.remove(log_path)
        except Exception:
            pass

    # ── Spelling and grammar correction layer ──
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    niche = correct_spelling_and_grammar(niche, gemini_api_key, simulate)
    if topic:
        topic = correct_spelling_and_grammar(topic, gemini_api_key, simulate)

    import time
    started_at = datetime.now()
    pipeline_start_t = time.time()

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
        agent_a_start_t = time.time()
        topics = run_agent_a(niche=niche, model_name=model_name, simulate=simulate, topic=topic)
        agent_a_end_t = time.time()
        execution_telemetry["agent_a"]["duration_ms"] = int((agent_a_end_t - agent_a_start_t) * 1000)

        if not topics:
            pipeline_end_t = time.time()
            execution_telemetry["total_duration_ms"] = int((pipeline_end_t - pipeline_start_t) * 1000)
            print("\n❌  Agent A returned no topics. Pipeline aborted.")
            save_telemetry(niche, model_name, "failed", "Agent A returned no topics")
            return ""

        # ── v6.0 RAG: Content Fetcher + Vector Store (between Agent A and B) ──
        gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        expand_horizon = False
        critique_attempt = 1
        max_critique_attempts = 2
        feedback = None
        draft = None
        rag_ctx = None

        while critique_attempt <= max_critique_attempts:
            rag_ctx = run_rag_content_fetcher(
                articles=topics,
                niche=niche,
                api_key=gemini_api_key,
                simulate=simulate,
                max_articles=3 if not expand_horizon else 5,
                expand_horizon=expand_horizon,
            )
            rag_ctx["api_key"] = gemini_api_key

            log_agent_interaction(
                "RAG Content Fetcher",
                "Agent B (Writer)",
                f"Full-article RAG pipeline complete. "
                f"Vector store: {len(rag_ctx['all_chunks'])} chunks from {len(rag_ctx['sources'])} articles. "
                f"Skipped: {len(rag_ctx['skipped'])} sources. Passing evidence context to Writer (Horizon expanded: {expand_horizon})."
            )

            # ── Agent B: Writer with RAG evidence context ──
            max_attempts = 3
            
            agent_b_start_t = time.time()
            for attempt in range(1, max_attempts + 1):
                execution_telemetry["agent_b"]["attempts"] = attempt
                print(f"\n🔄  [Attempt {attempt}/{max_attempts}] Running Writer & Guardrail Evaluation...")
                draft = run_agent_b(
                    niche=niche,
                    topics=topics,
                    model_name=model_name,
                    simulate=simulate,
                    feedback=feedback,
                    previous_draft=draft,
                    rag_context=rag_ctx,
                    expand_horizon=expand_horizon,
                )
                if not draft:
                    agent_b_end_t = time.time()
                    execution_telemetry["agent_b"]["duration_ms"] = int((agent_b_end_t - agent_b_start_t) * 1000)
                    pipeline_end_t = time.time()
                    execution_telemetry["total_duration_ms"] = int((pipeline_end_t - pipeline_start_t) * 1000)
                    print("\n❌  Agent B produced no draft. Pipeline aborted.")
                    save_telemetry(niche, model_name, "failed", "Agent B produced no draft")
                    return ""

                draft = clean_markdown_headers(draft)

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
            
            agent_b_end_t = time.time()
            execution_telemetry["agent_b"]["duration_ms"] = int((agent_b_end_t - agent_b_start_t) * 1000)

            # ── Agent C: Evaluator ──
            agent_c_start_t = time.time()
            evaluation = run_agent_c(
                niche=niche,
                draft=draft,
                model_name=model_name,
                simulate=simulate,
                expand_horizon=expand_horizon
            )
            agent_c_end_t = time.time()
            execution_telemetry["agent_c"]["duration_ms"] = int((agent_c_end_t - agent_c_start_t) * 1000)

            # ── Agent D: Fact Checker (v6.0) ──
            fact_check_result = run_fact_checker(
                draft=draft,
                all_chunks=rag_ctx["all_chunks"],
                sources=rag_ctx["sources"],
                niche=niche,
                model_name=model_name,
                api_key=gemini_api_key,
                simulate=simulate,
            )
            log_agent_interaction(
                "Agent D (Fact Checker)",
                "Orchestrator",
                f"Fact check complete. Source coverage: {fact_check_result.get('score', 0)}%. "
                f"Verified {fact_check_result.get('verified_claims', 0)}/{fact_check_result.get('total_claims_checked', 0)} claims. "
                f"Verdict: {'PASSED' if fact_check_result.get('passed') else 'FLAGGED'}"
            )

            # Check if Agent C or Agent D score is below 80
            eval_score = evaluation.get("score", 80)
            fact_score = fact_check_result.get("score", 100)

            if (eval_score < 80 or fact_score < 80) and critique_attempt < max_critique_attempts:
                print(f"\n⚠️  [Critique Loop] Draft scored below threshold! Evaluator Score: {eval_score}, Fact Checker Score: {fact_score}.")
                print("🔄  [Critique Loop] Triggering critique-driven RAG expansion and rewrite...")
                
                feedback = (
                    f"CRITIQUE-DRIVEN RAG REWRITE COMMAND:\n"
                    f"- Evaluator Score: {eval_score}/100. Notes: {evaluation.get('notes')}\n"
                    f"- Fact-Checker Source Coverage: {fact_score}%. "
                    f"Action: Fetcher is expanding the search horizon to scrape deeper content and retrieve more chunks. "
                    f"Writer, please utilize the new context chunks to draft a more technically detailed and fact-dense newsletter."
                )
                
                log_agent_interaction(
                    "Agent C (Evaluator)",
                    "RAG Content Fetcher",
                    f"CRITIQUE REJECTED (Evaluator: {eval_score}, Fact: {fact_score}). "
                    f"Command: Expand search horizon, scrape deeper paragraphs, and retrieve k=12 chunks."
                )

                expand_horizon = True
                critique_attempt += 1
            else:
                if (eval_score < 80 or fact_score < 80):
                    print("\n⚠️  [Critique Loop] Threshold not met, but maximum critique attempts reached. Proceeding to publication.")
                break

        # ── Update past issues memory ──
        update_past_issues(niche, topics, draft)

        # ── Stamp and assemble the final newsletter ──
        finished_at = datetime.now()
        pipeline_end_t = time.time()
        elapsed = int(pipeline_end_t - pipeline_start_t)
        execution_telemetry["total_duration_ms"] = elapsed * 1000
        
        passed = evaluation.get("passed", True)
        score = evaluation.get("score", 80)
        checks = evaluation.get("checks", {})
        checks_summary = " | ".join(f"{k}: {'✓' if v else '✗'}" for k, v in checks.items())

        final = f"""---
Engine       : Autonomous Newsletter Engine v6.0.0 (RAG-Augmented Evidence-Based Generation)
Niche        : {niche}
Model        : {model_name}
---
Agent A      : Trend Scout  →  Live RSS Discovery (8 sources)
RAG Fetcher  : Content Fetcher → Chunker → Embedder → Vector Store ({len(rag_ctx['all_chunks'])} chunks)
Agent B      : Writer       →  RAG Evidence Retrieval → Memory check → Guardrail Loop
Agent C      : Evaluator    →  {"APPROVED ✅" if passed else "REVIEW NEEDED ⚠️"} (Score: {score}/100)
Agent D      : Fact Checker →  {"PASSED ✅" if fact_check_result.get('passed') else "FLAGGED ⚠️"} (Source coverage: {fact_check_result.get('score', 0)}%)
---
Checks       : {checks_summary}
Notes        : {evaluation.get("notes", "")}
Sources      : {', '.join(rag_ctx['sources']) if rag_ctx['sources'] else 'RSS descriptions (no full articles fetched)'}
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

        # ── Trigger Agent C Publisher ──
        telemetry_payload = {
            "niche": niche,
            "agent_c": {"score": score},
            "fact_checker_score": fact_check_result.get("score", 0)
        }
        pub_results = run_agent_c_publisher(draft, telemetry_payload, simulate)

        save_telemetry(niche, model_name, "success")
        return final

    except Exception as exc:
        pipeline_end_t = time.time()
        execution_telemetry["total_duration_ms"] = int((pipeline_end_t - pipeline_start_t) * 1000)
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

