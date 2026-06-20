import os
import sys
import json
import glob
from datetime import datetime

# ── Streamlit Cloud: pull GEMINI_API_KEY from Secrets if present ──────────────
try:
    import streamlit as st
    _secrets = getattr(st, "secrets", {})
    if "GEMINI_API_KEY" in _secrets and not os.environ.get("GEMINI_API_KEY"):
        os.environ["GEMINI_API_KEY"] = _secrets["GEMINI_API_KEY"]
except Exception:
    pass

# Safe import — agent_pipeline no longer sys.exit() at module load
try:
    from agent_pipeline import run_pipeline
    PIPELINE_AVAILABLE = True
except Exception as _import_err:
    PIPELINE_AVAILABLE = False
    _import_err_msg = str(_import_err)

import streamlit as st

# ──────────────────────────────────────────────────────────────────────────────
# Page Config
# ──────────────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Autonomous Newsletter Fleet Dashboard",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ──────────────────────────────────────────────────────────────────────────────
# Custom CSS Theme
# ──────────────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');

html, body, [class*="css"] {
    font-family: 'Outfit', 'Segoe UI', sans-serif;
}

.main .block-container {
    padding-top: 1.5rem;
    padding-bottom: 2rem;
    max-width: 1200px;
}

/* Metric cards */
.metric-card {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 1.3rem 1.5rem;
    margin-bottom: 1rem;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
}
.metric-card h4 {
    margin: 0 0 0.4rem 0;
    color: #94a3b8;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
}
.metric-card p {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
    color: #f1f5f9;
    line-height: 1.1;
}
.metric-card .sub {
    font-size: 0.7rem;
    color: #64748b;
    margin-top: 0.3rem;
}

/* Status badges */
.badge-success { color: #22c55e; font-weight: 700; }
.badge-fail    { color: #ef4444; font-weight: 700; }
.badge-idle    { color: #94a3b8; font-weight: 700; }
.badge-run     { color: #f59e0b; font-weight: 700; }

/* Section header */
.section-header {
    font-size: 1.1rem;
    font-weight: 700;
    color: #1d63ed;
    border-bottom: 2px solid #1d63ed22;
    padding-bottom: 0.5rem;
    margin-bottom: 1.2rem;
}

/* Run button */
div.stButton > button {
    background: linear-gradient(135deg, #1d63ed, #0ea5e9) !important;
    color: white !important;
    border-radius: 8px !important;
    border: none !important;
    padding: 0.55rem 1.4rem !important;
    font-weight: 700 !important;
    font-size: 0.9rem !important;
    transition: all 0.2s ease !important;
    width: 100%;
}
div.stButton > button:hover {
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(29,99,237,0.4) !important;
}

/* Log entry */
.log-item {
    background: #0f172a;
    border: 1px solid #1e3a5f;
    border-left: 4px solid #1d63ed;
    border-radius: 0 8px 8px 0;
    padding: 1rem 1.2rem;
    margin-bottom: 0.8rem;
}
.log-item-fail {
    background: #1a0a0a;
    border: 1px solid #4a1010;
    border-left: 4px solid #ef4444;
    border-radius: 0 8px 8px 0;
    padding: 1rem 1.2rem;
    margin-bottom: 0.8rem;
}

/* Sidebar */
section[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #020617 0%, #0f172a 100%) !important;
}
section[data-testid="stSidebar"] * {
    color: #cbd5e1 !important;
}
</style>
""", unsafe_allow_html=True)

# ──────────────────────────────────────────────────────────────────────────────
# Data loaders
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))

def load_history():
    path = os.path.join(PROJECT_DIR, "run_history.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def load_worker_status():
    path = os.path.join(PROJECT_DIR, "background_worker_status.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None

def get_drafts():
    drafts = glob.glob(os.path.join(PROJECT_DIR, "newsletter_*.md"))
    drafts.sort(key=os.path.getmtime, reverse=True)
    return [os.path.basename(d) for d in drafts]

def load_interactions():
    path = os.path.join(PROJECT_DIR, "agent_interactions.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

# ──────────────────────────────────────────────────────────────────────────────
# Sidebar
# ──────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## 🤖 Fleet Control")
    st.markdown("---")

    niche = st.selectbox(
        "📡 Niche Focus",
        ["AI & Agentic Frameworks", "Rust Systems & WebAssembly",
         "Web3 Development", "Cloud Architecture", "Developer Productivity"],
        key="niche_select"
    )

    model = st.selectbox(
        "🧠 Generative Model",
        ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash"],
        key="model_select"
    )

    simulate = st.checkbox("💤 Offline Simulation Mode", value=True, key="simulate_check")

    # Allow pasting API key directly in the sidebar (for Streamlit Cloud)
    if not os.environ.get("GEMINI_API_KEY"):
        api_key_input = st.text_input(
            "🔑 Gemini API Key (optional, for live runs)",
            type="password",
            help="Set GEMINI_API_KEY in Streamlit Secrets for persistent config",
            key="api_key_input"
        )
        if api_key_input:
            os.environ["GEMINI_API_KEY"] = api_key_input.strip()
    else:
        st.success("✅ GEMINI_API_KEY configured")

    st.markdown("---")
    force_run = st.button("🚀 Force Manual Run", key="force_run_btn")

    # Worker status
    st.markdown("---")
    st.markdown("**⚙️ Background Worker**")
    worker_status = load_worker_status()
    if worker_status:
        state = worker_status.get("status", "unknown").upper()
        color = {"GENERATING": "#f59e0b", "IDLE": "#22c55e", "STOPPED": "#ef4444"}.get(state, "#94a3b8")
        st.markdown(f"Status: <span style='color:{color};font-weight:700'>{state}</span>", unsafe_allow_html=True)
        st.markdown(f"Interval: `{worker_status.get('interval_seconds', 0)}s`")
        if worker_status.get("next_run"):
            next_dt = datetime.fromisoformat(worker_status["next_run"].replace("Z", ""))
            st.markdown(f"Next run: `{next_dt.strftime('%H:%M:%S')}`")
    else:
        st.markdown("<span style='color:#ef4444;font-weight:700'>INACTIVE</span>", unsafe_allow_html=True)
        st.caption("Run: `python background_worker.py --simulate`")

    st.markdown("---")
    st.caption("Autonomous Newsletter Engine v5.0.0\nDay 5: Production Observability")

# ──────────────────────────────────────────────────────────────────────────────
# Header
# ──────────────────────────────────────────────────────────────────────────────
st.markdown("# 🤖 Autonomous Newsletter Fleet Dashboard")
st.markdown(
    "**Day 5 — Production-Grade Observability.** "
    "Live feed of your autonomous multi-agent publishing engine."
)

if not PIPELINE_AVAILABLE:
    st.error(f"⚠️ Pipeline module could not be loaded: {_import_err_msg}")
    st.info("The dashboard will still show historical data from `run_history.json`.")

# ──────────────────────────────────────────────────────────────────────────────
# Manual run trigger
# ──────────────────────────────────────────────────────────────────────────────
if force_run:
    if not PIPELINE_AVAILABLE:
        st.error("Cannot run pipeline — module failed to load.")
    else:
        with st.status("🚀 Executing multi-agent pipeline...", expanded=True) as status_box:
            try:
                st.write("⚡ Waking up Agent A (Trend Scout)...")
                st.write(f"📡 Sourcing RSS feeds for: **{niche}**")
                final_content = run_pipeline(niche=niche, model_name=model, simulate=simulate)
                status_box.update(label="✅ Pipeline complete!", state="complete")
                st.success("Newsletter draft saved to project directory.")
                st.toast("Newsletter published!", icon="📰")
                st.rerun()
            except EnvironmentError as e:
                status_box.update(label="❌ Configuration error", state="error")
                st.error(f"**Missing API key:** {e}")
                st.info("Enable 'Offline Simulation Mode' in the sidebar, or enter your Gemini API key.")
            except Exception as e:
                status_box.update(label="❌ Pipeline failed", state="error")
                st.error(f"**Error:** {e}")

# ──────────────────────────────────────────────────────────────────────────────
# Top-Level Metric Cards
# ──────────────────────────────────────────────────────────────────────────────
history = load_history()
drafts = get_drafts()

col1, col2, col3, col4 = st.columns(4)

with col1:
    if history:
        last_dt = datetime.fromisoformat(history[-1]["timestamp"].replace("Z", ""))
        wake_str = last_dt.strftime("%b %d, %H:%M")
        sub = f"{(datetime.now() - last_dt).seconds // 60}m ago"
    else:
        wake_str = "Never"
        sub = "No runs yet"
    st.markdown(f"""
    <div class="metric-card">
      <h4>Agent A Last Wake</h4>
      <p>{wake_str}</p>
      <div class="sub">{sub}</div>
    </div>""", unsafe_allow_html=True)

with col2:
    total_runs = len(history)
    success_runs = sum(1 for r in history if r.get("status") == "success")
    st.markdown(f"""
    <div class="metric-card">
      <h4>Total Fleet Cycles</h4>
      <p>{total_runs}</p>
      <div class="sub">{success_runs} successful</div>
    </div>""", unsafe_allow_html=True)

with col3:
    total_tokens = sum(r.get("agent_b", {}).get("total_tokens", 0) for r in history)
    st.markdown(f"""
    <div class="metric-card">
      <h4>Total Tokens Used</h4>
      <p>{total_tokens:,}</p>
      <div class="sub">across all runs</div>
    </div>""", unsafe_allow_html=True)

with col4:
    rate = int(success_runs / total_runs * 100) if total_runs > 0 else 100
    avg_score = int(sum(r.get("agent_c", {}).get("score", 0) for r in history) / total_runs) if total_runs > 0 else 0
    st.markdown(f"""
    <div class="metric-card">
      <h4>Avg Quality Score</h4>
      <p>{avg_score}/100</p>
      <div class="sub">{rate}% compliance rate</div>
    </div>""", unsafe_allow_html=True)

st.markdown("")

# ──────────────────────────────────────────────────────────────────────────────
# Tabs
# ──────────────────────────────────────────────────────────────────────────────
tab_interactions, tab_logs, tab_drafts, tab_charts = st.tabs([
    "💬 Live Agent Cooperation",
    "📋 Fleet Transaction Logs",
    "📰 Newsletter Archive",
    "📈 Metrics & Analytics"
])

# ── Tab 0: Live Agent Cooperation ──
with tab_interactions:
    st.markdown('<div class="section-header">Agent-to-Agent Interactive Chat & Cooperation</div>', unsafe_allow_html=True)
    interactions = load_interactions()
    if not interactions:
        st.info("No active agent communications recorded. Click **Force Manual Run** in the sidebar to start a new execution cycle.")
    else:
        st.markdown(f"**{len(interactions)} messages exchanged** during the last execution cycle.")
        for msg in interactions:
            sender = msg.get("sender", "Agent")
            receiver = msg.get("receiver", "Agent")
            time_str = msg.get("timestamp", "")
            text = msg.get("message", "")
            
            # Custom styling based on sender/agent
            border_color = "#3b82f6"  # default blue
            sender_color = "#38bdf8"
            
            if "Scout" in sender or "Agent A" in sender:
                border_color = "#a855f7" # purple
                sender_color = "#c084fc"
            elif "Writer" in sender or "Agent B" in sender:
                border_color = "#eab308" # yellow
                sender_color = "#fde047"
            elif "Guardrail" in sender:
                border_color = "#ef4444" # red
                sender_color = "#fca5a5"
            elif "Evaluator" in sender or "Agent C" in sender:
                border_color = "#22c55e" # green
                sender_color = "#86efac"
            elif "Memory" in sender:
                border_color = "#06b6d4" # cyan
                sender_color = "#67e8f9"
                
            st.markdown(f"""
            <div style="padding: 0.8rem 1.2rem; margin-bottom: 0.8rem; border-radius: 8px; background: #0b0f19; border: 1px solid #1e293b; border-left: 4px solid {border_color};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                    <div>
                        <span style="font-weight: 700; color: {sender_color}; font-size: 0.9rem;">{sender}</span>
                        <span style="color: #64748b; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem;">➔ to {receiver}</span>
                    </div>
                    <span style="color: #475569; font-size: 0.75rem; font-family: monospace;">{time_str}</span>
                </div>
                <div style="color: #e2e8f0; font-size: 0.88rem; line-height: 1.4; white-space: pre-wrap;">{text}</div>
            </div>
            """, unsafe_allow_html=True)

# ── Tab 1: Transaction Logs ──
with tab_logs:
    st.markdown('<div class="section-header">Live Agent Execution History</div>', unsafe_allow_html=True)

    if not history:
        st.info("No runs recorded yet. Use **Force Manual Run** in the sidebar to start the pipeline.")
    else:
        for idx, run in enumerate(reversed(history)):
            run_time = datetime.fromisoformat(run["timestamp"].replace("Z", "")).strftime("%Y-%m-%d %H:%M:%S")
            is_success = run.get("status") == "success"
            status_label = "✅ SUCCESS" if is_success else "❌ FAILED"
            niche_label = run.get("niche", "Unknown")
            score = run.get("agent_c", {}).get("score", 0)

            with st.expander(
                f"{'🟢' if is_success else '🔴'}  [{run_time}]  {niche_label}  —  Score: {score}/100",
                expanded=(idx == 0)
            ):
                c1, c2 = st.columns(2)

                with c1:
                    st.markdown("#### 🔍 Agent A — Trend Scout")
                    st.markdown(f"**Source:** `{run.get('agent_a', {}).get('source', 'N/A')}`")
                    headlines = run.get("agent_a", {}).get("headlines_pulled", [])
                    if headlines:
                        for h in headlines:
                            st.markdown(f"- {h}")
                    else:
                        st.caption("No headlines recorded.")

                with c2:
                    st.markdown("#### ✍️ Agent B — Writer Telemetry")
                    b = run.get("agent_b", {})
                    st.markdown(f"**Attempts:** `{b.get('attempts', 0)}`")
                    st.markdown(f"**Prompt Tokens:** `{b.get('prompt_tokens', 0):,}`")
                    st.markdown(f"**Output Tokens:** `{b.get('output_tokens', 0):,}`")
                    st.markdown(f"**Total Tokens:** `{b.get('total_tokens', 0):,}`")
                    violations = b.get("violations", [])
                    if violations:
                        st.markdown("**🛡️ Guardrail Violations Fixed:**")
                        for v in violations:
                            st.warning(v, icon="⚠️")
                    else:
                        st.success("No guardrail violations.", icon="✅")

                st.markdown("---")
                c = run.get("agent_c", {})
                verdict = "✅ APPROVED" if c.get("passed") else "⚠️ REVIEW NEEDED"
                st.markdown(f"**🔬 Agent C Verdict:** {verdict} &nbsp;|&nbsp; Score: `{c.get('score', 0)}/100`")
                if c.get("notes"):
                    st.markdown(f"*{c.get('notes')}*")

                if not is_success and run.get("error"):
                    st.error(f"Error: {run.get('error')}")

# ── Tab 2: Newsletter Archive ──
with tab_drafts:
    st.markdown('<div class="section-header">Generated Newsletter Drafts</div>', unsafe_allow_html=True)

    if not drafts:
        st.info("No newsletter drafts found yet. Run the pipeline to generate your first issue.")
    else:
        st.markdown(f"**{len(drafts)} draft(s)** found in project directory.")
        selected = st.selectbox("Select a draft to read:", drafts, key="draft_select")

        if selected:
            draft_path = os.path.join(PROJECT_DIR, selected)
            try:
                with open(draft_path, "r", encoding="utf-8") as f:
                    content = f.read()

                # Split off the metadata header block for clean rendering
                parts = content.split("---\n\n", maxsplit=1)
                if len(parts) == 2:
                    meta_block = parts[0]
                    body = parts[1]
                    with st.expander("📋 Engine Metadata", expanded=False):
                        st.code(meta_block.replace("---\n", "").strip(), language="yaml")
                    st.markdown(body)
                else:
                    st.markdown(content)
            except Exception as e:
                st.error(f"Failed to read draft: {e}")

# ── Tab 3: Analytics Charts ──
with tab_charts:
    st.markdown('<div class="section-header">Token Usage & Quality Trends</div>', unsafe_allow_html=True)

    if len(history) < 1:
        st.info("Run the pipeline at least once to see analytics data here.")
    else:
        try:
            import pandas as pd

            data = []
            for run in history:
                data.append({
                    "Run": datetime.fromisoformat(run["timestamp"].replace("Z", "")).strftime("%m-%d %H:%M"),
                    "Total Tokens": run.get("agent_b", {}).get("total_tokens", 0),
                    "Prompt Tokens": run.get("agent_b", {}).get("prompt_tokens", 0),
                    "Output Tokens": run.get("agent_b", {}).get("output_tokens", 0),
                    "Quality Score": run.get("agent_c", {}).get("score", 0),
                    "Attempts": run.get("agent_b", {}).get("attempts", 1),
                })
            df = pd.DataFrame(data)
            df = df.set_index("Run")

            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown("##### 📊 Token Consumption per Run")
                st.bar_chart(df[["Prompt Tokens", "Output Tokens"]])

            with col_b:
                st.markdown("##### 🏆 Agent C Quality Score Trend")
                st.line_chart(df["Quality Score"])

            st.markdown("##### 📈 Rewrite Attempts per Run")
            st.bar_chart(df["Attempts"])

            st.markdown("---")
            st.markdown("**Summary Statistics**")
            st.dataframe(df.describe().round(1), use_container_width=True)

        except Exception as e:
            st.error(f"Failed to render charts: {e}")
