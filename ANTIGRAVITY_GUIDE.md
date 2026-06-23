# Antigravity Developer & Agent Guide

This file provides critical context, shortcuts, and operational rules to help developers and AI Coding Agents (like Antigravity) understand, run, test, and edit this codebase with maximum token efficiency, speed, and safety.

---

## 🚀 1. TL;DR Quickstart for Agents

If you are an AI assistant starting a task in this repository:
1. **Do NOT scan the entire repository** or read large files like `past_issues.json` (5.4MB). Check the `.agent_code_map.md` or this guide instead.
2. **If you modify React frontend code (`src/`)**, you **MUST restart the dev server** (`npm run dev`) for the changes to apply, because Hot Module Replacement (HMR) and file watching are disabled by default (`DISABLE_HMR=true`) to conserve CPU.
3. **If you are running the edge case test suite**, run `python test_edge_cases.py`. It runs in pure offline simulation mode with zero API key dependencies in **~2.3 seconds**.

---

## 📁 2. Core Architecture Reference

| File / Directory | Responsibility | Critical Note for Agents |
| :--- | :--- | :--- |
| **`server.ts`** | Express API backend, serves Vite frontend, handles `/api/generate` pipeline router. | Handles unified LLM routing (Gemini, OpenAI, Anthropic, Groq, Ollama) and programmatic guardrails. |
| **`agent_pipeline.py`** | Core Python multi-agent pipeline orchestrating Scout, Writer, Evaluator, and Fact Checker. | Uses standard Python library imports. Embeds the main multi-agent pipeline logic. |
| **`src/App.tsx`** | Vite React dashboard. Handles config inputs, log streams, outbox previews, and OpenTelemetry span trees. | Inputs (niche, topic, model choice) are persisted via `localStorage` to prevent reset on page refresh. |
| **`past_issues.json`** | Dense vector store of historical articles (5.4MB). | **NEVER read this file.** It will blow your context window. Use code in `agent_pipeline.py` to see schema. |
| **`run_history.json`** | Run history logs and execution telemetry. | Contains token usage, scores, and execution metadata of previous runs. |
| **`agent_interactions.json`** | Conversational trace representing cooperation logs of the last pipeline run. | Used by Tab 1 in the UI. |

---

## ⚡ 3. Efficient Development & Testing Rules

### 3.1 Fast Offline Simulation Testing
The project includes a robust 10-scenario offline stress test suite that exercises all agentic behaviors (guardrails, RAG, compliance rewrites, deduplication, publishing outbox).
* **Run command**: `python test_edge_cases.py`
* **Why it is fast**: It automatically clears `GEMINI_API_KEY` post-import to force pure offline mock simulation. Runs in **~2 seconds**.

### 3.2 Vite Dev Server Reloads
In this environment, Vite's file watcher is disabled:
```typescript
// vite.config.ts
hmr: process.env.DISABLE_HMR !== 'true',
watch: process.env.DISABLE_HMR === 'true' ? null : {},
```
If you edit `src/App.tsx` or styling, the browser will **NOT** hot-reload or auto-recompile.
* **To apply edits**: Kill the node processes and run `npm run dev` again.
* **To kill Node on Windows (PowerShell)**:
  ```powershell
  Stop-Process -Id (Get-Process -Name node).Id -Force
  npm run dev
  ```

### 3.3 Accessing Credentials
* Gemini API Key, OpenAI API Key, etc., can be loaded from `.env` or set directly in the UI.
* Publishing target credentials (WordPress & Webhooks) are defined in `publishing_config.json` (which is excluded from Git to prevent leaks).

---

## 🛠️ 4. Common Commands Reference

* **Start Dev Server**: `npm run dev`
* **Production Build**: `npm run build`
* **Static TypeScript Lint**: `npm run lint`
* **Run CLI Agent Pipeline (Mock)**: `python agent_pipeline.py --simulate`
* **Run CLI Agent Pipeline (Live)**: `python agent_pipeline.py --niche "Rust Systems" --model "gemini-2.5-flash"`
* **Run Offline Test Suite**: `python test_edge_cases.py`
