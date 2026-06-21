---
description: Run the multi-agent pipeline (Trend Scout, RAG Fetcher, Writer, Evaluator, Fact Checker) to generate a newsletter via the React dashboard or Python CLI.
---

Follow this workflow to run the full v6.0 multi-agent pipeline:

## Method 1 — React Dashboard (Recommended)

1. **Start the dev server** (if not already running):
   ```powershell
   npm run dev
   ```
   The app will be live at `http://localhost:3000`.

2. **Open the dashboard** in your browser at `http://localhost:3000`.

3. **Configure the run**:
   - Select a **Niche** from the dropdown (e.g. "AI & Agentic Frameworks").
   - *Optional:* Enter a **Custom Topic** to bypass RSS feeds.
   - *Optional:* Select a **Model** (default: `gemini-2.5-flash`).
   - *Optional:* Paste your `GEMINI_API_KEY` (starts with `AIza...`) in the API key field. If omitted, the pipeline runs in **Simulation Mode**.

4. **Click "WAKE UP MULTI-AGENT NEWSROOM"**.

5. **Monitor the run**:
   - Watch the **Live Agent Logs** panel for real-time agent activity.
   - Switch to **💬 Live Agent Cooperation** tab to see the group chat between agents.
   - Switch to **📊 Observability Traces** to view the 6-span Gantt chart timeline.

6. **Verify output**:
   - Newsletter draft appears in the **Workstation** tab.
   - Run telemetry (including Agent D fact-check score) is saved to `run_history.json`.
   - Newsletter is archived to `newsletters/newsletter_<niche>_<timestamp>.md`.

---

## Method 2 — Python CLI

1. **Activate virtual environment**:
   ```powershell
   venv\Scripts\activate
   ```

2. **Run the pipeline**:
   ```powershell
   python agent_pipeline.py
   ```
   *Optional parameters:*
   ```powershell
   python agent_pipeline.py --niche "Rust Systems & WebAssembly"
   python agent_pipeline.py --niche "Edge AI & Distributed Compute" --model "gemini-1.5-pro"
   ```

3. **Verify output**:
   - Confirm pipeline completes with no errors.
   - Check that a timestamped `.md` file was created in the project root.

---

## Simulation Mode (No API Key)
If the `GEMINI_API_KEY` is missing or blocked (403), the pipeline **automatically** falls back to Simulation Mode:
- Agent A uses niche-matched simulated headlines.
- Agent B uses a pre-compiled template with an intentional formatting error to test the guardrail loop.
- Agent C, Agent D, and all telemetry spans still run and produce real output.
