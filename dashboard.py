import os
import json
import glob
from datetime import datetime
import streamlit as st
from agent_pipeline import run_pipeline

# ──────────────────────────────────────────────────────────────────────────────
# Page Configuration & Rich CSS Theme styling
# ──────────────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Autonomous Newsletter Fleet Dashboard",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Inject custom corporate slate theme with Royal Blue accents
st.markdown("""
<style>
    /* Main layout improvements */
    .main .block-container {
        padding-top: 2rem;
        padding-bottom: 2rem;
    }
    
    /* Header and accent styling */
    h1, h2, h3 {
        color: #0f172a !important;
        font-family: 'Outfit', 'Segoe UI', sans-serif;
    }
    
    /* Custom button styling */
    div.stButton > button {
        background-color: #1d63ed !important;
        color: white !important;
        border-radius: 6px !important;
        border: none !important;
        padding: 0.5rem 1rem !important;
        font-weight: 600 !important;
        transition: all 0.2s ease-in-out;
    }
    
    div.stButton > button:hover {
        background-color: #154ec1 !important;
        box-shadow: 0px 4px 10px rgba(29, 99, 237, 0.3) !important;
        transform: translateY(-1px);
    }
    
    /* Custom card styles */
    .metric-card {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 1.2rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        margin-bottom: 1rem;
    }
    .metric-card h4 {
        margin: 0;
        color: #64748b;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .metric-card p {
        margin: 0.4rem 0 0 0;
        font-size: 1.6rem;
        font-weight: 700;
        color: #0f172a;
    }
    
    /* Activity item border decoration */
    .log-item {
        border-left: 3px solid #1d63ed;
        background-color: #f8fafc;
        padding: 0.8rem 1.2rem;
        border-radius: 0 8px 8px 0;
        margin-bottom: 0.8rem;
    }
    .log-item-fail {
        border-left: 3px solid #ef4444;
        background-color: #fef2f2;
        padding: 0.8rem 1.2rem;
        border-radius: 0 8px 8px 0;
        margin-bottom: 0.8rem;
    }
</style>
""", unsafe_allow_html=True)

# ──────────────────────────────────────────────────────────────────────────────
# Data Loaders
# ──────────────────────────────────────────────────────────────────────────────
def load_history():
    history_path = os.path.join(os.path.dirname(__file__), "run_history.json")
    if os.path.exists(history_path):
        try:
            with open(history_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def load_worker_status():
    status_path = os.path.join(os.path.dirname(__file__), "background_worker_status.json")
    if os.path.exists(status_path):
        try:
            with open(status_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None

def get_drafts():
    files = glob.glob("newsletter_*.md")
    # Sort by modification time, latest first
    files.sort(key=os.path.getmtime, reverse=True)
    return files

# ──────────────────────────────────────────────────────────────────────────────
# Sidebar controls
# ──────────────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.image("assets/newsletter_logo.png" if os.path.exists("assets/newsletter_logo.png") else "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=150", width=80)
    st.markdown("### 🤖 Engine Settings")
    
    niche = st.selectbox(
        "Niche focus",
        ["AI & Agentic Frameworks", "Rust Systems & WebAssembly", "Web3 Development", "Cloud Architecture", "Developer Productivity"]
    )
    
    model = st.selectbox(
        "Generative model",
        ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash"]
    )
    
    simulate = st.checkbox("Offline Simulation Mode", value=True)
    
    st.markdown("---")
    st.markdown("### ⚡ Actions")
    
    force_run = st.button("Force Manual Run")
    
    st.markdown("---")
    # Display background worker status in sidebar
    worker_status = load_worker_status()
    if worker_status:
        state = worker_status.get("status", "unknown").upper()
        if state == "GENERATING":
            st.markdown(f"**Worker Status**: 🔄 `{state}`")
        elif state == "IDLE":
            st.markdown(f"**Worker Status**: 💤 `{state}`")
        else:
            st.markdown(f"**Worker Status**: 🛑 `{state}`")
            
        st.markdown(f"**Interval**: `{worker_status.get('interval_seconds', 0)}s`")
        if worker_status.get("next_run"):
            next_dt = datetime.fromisoformat(worker_status.get("next_run").replace("Z", ""))
            st.markdown(f"**Next Wakeup**: `{next_dt.strftime('%H:%M:%S')}`")
    else:
        st.markdown("**Worker Status**: 🛑 `INACTIVE`")

# ──────────────────────────────────────────────────────────────────────────────
# Main dashboard UI
# ──────────────────────────────────────────────────────────────────────────────
st.markdown("# 🤖 The Autonomous Tech Newsletter Fleet")
st.markdown("Day 5: Production-Grade Observability Dashboard. Monitoring local multi-agent publisher processes.")

# Execute a run if requested
if force_run:
    with st.status("🚀 Running multi-agent generation pipeline..."):
        try:
            st.write("Waking up Trend Scout Agent A...")
            st.write("Sourcing RSS feeds...")
            # Set UTF-8 encoding environment variable
            os.environ["PYTHONIOENCODING"] = "utf-8"
            final_content = run_pipeline(niche=niche, model_name=model, simulate=simulate)
            st.success("Pipeline execution complete! Newsletter draft saved.")
            st.toast("Success! Stamped newsletter is ready.")
        except Exception as e:
            st.error(f"Execution failed: {e}")

# Load active metrics
history = load_history()
drafts = get_drafts()

# ──────────────────────────────────────────────────────────────────────────────
# Top Level Metrics Cards
# ──────────────────────────────────────────────────────────────────────────────
col1, col2, col3, col4 = st.columns(4)

with col1:
    last_wake_str = "Never"
    if history:
        # Find latest success/run timestamp
        last_dt = datetime.fromisoformat(history[-1].get("timestamp").replace("Z", ""))
        last_wake_str = last_dt.strftime("%b %d, %H:%M:%S")
    st.markdown(f"""
    <div class="metric-card">
        <h4>Last Agent A Wakeup</h4>
        <p>{last_wake_str}</p>
    </div>
    """, unsafe_allow_html=True)

with col2:
    total_runs = len(history)
    st.markdown(f"""
    <div class="metric-card">
        <h4>Total Fleet Cycles</h4>
        <p>{total_runs}</p>
    </div>
    """, unsafe_allow_html=True)

with col3:
    total_tokens = sum(run.get("agent_b", {}).get("total_tokens", 0) for run in history)
    st.markdown(f"""
    <div class="metric-card">
        <h4>Accumulative Tokens</h4>
        <p>{total_tokens:,}</p>
    </div>
    """, unsafe_allow_html=True)

with col4:
    success_runs = sum(1 for run in history if run.get("status") == "success")
    success_rate = int((success_runs / total_runs * 100)) if total_runs > 0 else 100
    st.markdown(f"""
    <div class="metric-card">
        <h4>Compliance Rate</h4>
        <p>{success_rate}%</p>
    </div>
    """, unsafe_allow_html=True)

# ──────────────────────────────────────────────────────────────────────────────
# Tabs for Logs & Drafts
# ──────────────────────────────────────────────────────────────────────────────
tab_logs, tab_drafts, tab_charts = st.tabs(["📋 Fleet Transaction Logs", "📰 Newsletter Archive", "📈 Token & Quality Metrics"])

with tab_logs:
    st.subheader("Live Feed of Agent Transaction History")
    if not history:
        st.info("No logs present in the execution database yet. Trigger a manual run or start the background worker.")
    else:
        for idx, run in enumerate(reversed(history)):
            run_time = datetime.fromisoformat(run.get("timestamp").replace("Z", "")).strftime("%Y-%m-%d %H:%M:%S")
            is_success = run.get("status") == "success"
            
            status_color = "green" if is_success else "red"
            status_text = "APPROVED" if is_success else "FAILED"
            
            with st.expander(f"🕒 [{run_time}] {run.get('niche')} — Model: {run.get('model')} — Status: {status_text}", expanded=(idx==0)):
                if is_success:
                    st.markdown(f"**Compliance Score**: `{run.get('agent_c', {}).get('score', 0)}/100` | **Attempts**: `{run.get('agent_b', {}).get('attempts', 0)}`")
                else:
                    st.error(f"Error Message: {run.get('error')}")
                    
                col_a, col_b = st.columns(2)
                
                with col_a:
                    st.markdown("#### 🔍 Agent A (Scout) Headlines Pulled")
                    st.markdown(f"**Source**: `{run.get('agent_a', {}).get('source')}`")
                    for headline in run.get("agent_a", {}).get("headlines_pulled", []):
                        st.markdown(f"- {headline}")
                        
                with col_b:
                    st.markdown("#### ✍️ Agent B (Writer) & C (Evaluator) Telemetry")
                    st.markdown(f"**Prompt Tokens**: `{run.get('agent_b', {}).get('prompt_tokens', 0):,}`")
                    st.markdown(f"**Output/Candidate Tokens**: `{run.get('agent_b', {}).get('output_tokens', 0):,}`")
                    st.markdown(f"**Total Tokens**: `{run.get('agent_b', {}).get('total_tokens', 0):,}`")
                    
                    violations = run.get("agent_b", {}).get("violations", [])
                    if violations:
                        st.markdown("**🛡️ Guardrail Violations Remediation**:")
                        for violation in violations:
                            st.warning(violation)
                    else:
                        st.success("No guardrail violations recorded.")
                        
                st.markdown("---")
                st.markdown(f"**Evaluator Comments**: *{run.get('agent_c', {}).get('notes', 'No evaluator notes available.')}*")

with tab_drafts:
    st.subheader("Compiled Newsletter Drafts Archive")
    if not drafts:
        st.info("No generated newsletters found in the local repository.")
    else:
        selected_file = st.selectbox("Select newsletter draft to read", drafts)
        if selected_file:
            try:
                with open(selected_file, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # Split off header for display if desired
                st.markdown("---")
                st.markdown(content)
            except Exception as e:
                st.error(f"Error loading newsletter: {e}")

with tab_charts:
    st.subheader("Fleet Analytics & Token Trends")
    if not history:
        st.info("Insufficient data to display metrics charts.")
    else:
        # Create line charts for token metrics and score metrics
        import pandas as pd
        
        data_points = []
        for run in history:
            data_points.append({
                "Timestamp": datetime.fromisoformat(run.get("timestamp").replace("Z", "")).strftime("%m-%d %H:%M"),
                "Total Tokens": run.get("agent_b", {}).get("total_tokens", 0),
                "Evaluator Score": run.get("agent_c", {}).get("score", 0),
                "Attempts": run.get("agent_b", {}).get("attempts", 0)
            })
        df = pd.DataFrame(data_points)
        
        st.markdown("#### Cumulative Token Consumption per Cycle")
        st.line_chart(df.set_index("Timestamp")["Total Tokens"])
        
        st.markdown("#### Grader Evaluation Score Trend")
        st.line_chart(df.set_index("Timestamp")["Evaluator Score"])
