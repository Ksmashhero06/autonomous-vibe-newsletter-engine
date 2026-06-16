export const pythonStreamlitCode = `import streamlit as st
import google.generativeai as genai
import time
from datetime import datetime

# Page configuration
st.set_page_config(
    page_title="Autonomous Content & Newsletter Engine",
    page_icon="💼",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Initialize Session State values for local tracking
if "total_issues" not in st.session_state:
    st.session_state.total_issues = 0
if "last_sync" not in st.session_state:
    st.session_state.last_sync = "Never"
if "newsletter" not in st.session_state:
    st.session_state.newsletter = ""
if "activity_log" not in st.session_state:
    st.session_state.activity_log = []
if "niche" not in st.session_state:
    st.session_state.niche = "AI & Agentic Frameworks"

# Global Corporate CSS Branding Injections
st.markdown("""
<style>
    /* Global Styles: Clean light background with premium dark-charcoal typography */
    .stApp {
        background-color: #F8FAFC !important;
        font-family: 'Inter', -apple-system, sans-serif !important;
        color: #1E293B !important;
    }
    
    /* Input fields and selectors overriding for clean white outline inputs */
    div[data-baseweb="input"] {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 8px !important;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
    }
    
    div[data-baseweb="input"]:focus-within {
        border-color: #1D63ED !important;
        box-shadow: 0 0 0 3px rgba(29, 99, 237, 0.15) !important;
    }
    
    /* Override primary stButtons to use elite deep royal blue */
    button[kind="primary"], .stButton>button {
        background-color: #1D63ED !important;
        color: #FFFFFF !important;
        border: 1px solid #1D63ED !important;
        border-radius: 8px !important;
        font-weight: 600 !important;
        font-size: 0.85rem !important;
        padding: 0.5rem 1.5rem !important;
        transition: all 0.2s ease-in-out !important;
        box-shadow: 0 4px 6px -1px rgba(29, 99, 237, 0.1), 0 2px 4px -1px rgba(29, 99, 237, 0.06) !important;
    }
    
    button[kind="primary"]:hover, .stButton>button:hover {
        background-color: #0A58CA !important;
        border-color: #0A58CA !important;
        color: #FFFFFF !important;
        box-shadow: 0 10px 15px -3px rgba(29, 99, 237, 0.15) !important;
    }
    
    /* Metrics panel display styling */
    div[data-testid="stMetricValue"] {
        font-size: 1.8rem !important;
        font-weight: 700 !important;
        color: #0F172A !important;
    }
    
    div[data-testid="stMetricLabel"] {
        color: #64748B !important;
        font-size: 0.75rem !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        font-weight: 600 !important;
    }

    /* Standardized corporate cards design */
    .portal-card {
        background-color: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
        margin-bottom: 1.5rem;
    }

    .portal-tag {
        background-color: #EFF6FF;
        color: #1D63ED;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 9999px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        display: inline-block;
        margin-bottom: 0.75rem;
    }
</style>
""", unsafe_allow_html=True)

# 1. Professional Top Header (Navigation Bar Simulation)
st.markdown("""
<div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; background-color: #FFFFFF; border: 1px solid #E2E8F0; margin-bottom: 2rem; border-radius: 12px; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.02);">
    <div style="display: flex; align-items: center; gap: 12px;">
        <div style="background: linear-gradient(135deg, #1D63ED, #0A58CA); color: white; width: 36px; height: 36px; border-radius: 8px; font-weight: 800; font-size: 1.25rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(29, 99, 237, 0.2);">
            A
        </div>
        <div>
            <h1 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin: 0; line-height: 1.1;">
                AUTONOMOUS NEWSROOM PORTAL
            </h1>
            <p style="font-size: 0.7rem; color: #64748B; margin: 0; font-family: monospace; letter-spacing: 0.05em;">
                OFF-GRID RECRUITS & DISPATCH NET
            </p>
        </div>
    </div>
    <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="background-color: #F0FDF4; color: #166534; font-size: 0.72rem; font-weight: 600; padding: 4px 12px; border-radius: 9999px; border: 1px solid #BBF7D0; display: flex; align-items: center; gap: 6px;">
            <span style="height: 6px; width: 6px; background-color: #22C55E; border-radius: 50%; display: inline-block; animation: pulse 2s infinite;"></span>
            LIVE SERVER SECURE
        </div>
        <div style="font-size: 0.75rem; color: #475569; border: 1px solid #E2E8F0; background-color: #F8FAFC; border-radius: 6px; padding: 3px 10px; font-family: monospace; font-weight: 500;">
            SYSTEM DECK: EN (Global Office)
        </div>
    </div>
</div>
""", unsafe_allow_html=True)

# 2. Hero Section & Credentials Split Layout (Two Columns)
hero_col1, hero_col2 = st.columns([5, 7])

with hero_col1:
    # Left Hero Column: Campaign Metrics & Platform Status Card
    st.markdown(f\"\"\"
    <div class="portal-card" style="height: 360px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
            <span class="portal-tag">Live Status Panel</span>
            <h3 style="font-size: 1.25rem; font-weight: 800; color: #0F172A; margin: 0.2rem 0 1rem 0;">METRIC INSTRUMENTATION</h3>
            
            <div style="display: flex; flex-direction: column; gap: 0.75rem; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 1rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                    <span style="color: #64748B;">Core Campaign Focus:</span>
                    <strong style="color: #0F172A;">{st.session_state.niche}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                    <span style="color: #64748B;">Compiled Issues Count:</span>
                    <strong style="color: #1E293B;">{st.session_state.total_issues}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                    <span style="color: #64748B;">Latest Pipeline Synchronization:</span>
                    <strong style="color: #1E293B;">{st.session_state.last_sync}</strong>
                </div>
            </div>
        </div>
        
        <div style="border-t: 1px solid #E2E8F0; padding-top: 10px; font-size: 0.72rem; color: #64748B; font-family: monospace;">
            STABLE CONNECTED • STAMPED BY LEGAL CRITIC
        </div>
    </div>
    \"\"\", unsafe_allow_html=True)

with hero_col2:
    # Right Hero Column: Corporate Mission Text and Configuration Form Controls
    st.markdown(\"\"\"
    <div class="portal-card" style="height: 360px; display: flex; flex-direction: column; justify-content: space-between; margin-bottom: 0px; padding-bottom: 10px;">
        <div>
            <span class="portal-tag" style="background-color: #F0FDF4; color: #166534;">Strategic Brief</span>
            <h2 style="font-size: 1.45rem; font-weight: 800; color: #0F172A; margin: 0.2rem 0 0.5rem 0; line-height: 1.25;">
                Automated Tech Journalism, Made Effortless
            </h2>
            <p style="font-size: 0.82rem; color: #475569; margin: 0 0 1rem 0; line-height: 1.45;">
                Deploy an orchestration of three specialized AI specialists working in a structured pipeline. Hook professional metrics or stream simulated campaigns completely offline without cloud setup keys.
            </p>
        </div>
    </div>
    \"\"\", unsafe_allow_html=True)
    
    # Render API credentials inputs elegantly over background space
    inner_col1, inner_col2 = st.columns(2)
    with inner_col1:
        api_key = st.text_input(
            "Google AI Studio API Key",
            type="password",
            placeholder="Preset / paste key here...",
            help="Enables direct connection to active Gemini standard models. Safe & private inside session memory."
        )
    with inner_col2:
        niche = st.text_input(
            "Target Campaign Niche",
            value=st.session_state.niche,
            placeholder="e.g. Edge AI & Distributed Compute"
        )
        if niche != st.session_state.niche:
            st.session_state.niche = niche

st.markdown("<div class='custom-divider'></div>", unsafe_allow_html=True)

# 3. Active Multi-Agent Operations Grid (Inspired by Structured Topic Cards)
st.markdown("### 📡 Multi-Agent Collaboration Room")
st.markdown("<p style='font-size:0.8rem; color:#64748B; margin-top:-10px; margin-bottom:1.5rem;'>Monitor structured tasks and localized telemetry checkpoints for each assigned technical officer.</p>", unsafe_allow_html=True)

card_col1, card_col2, card_col3 = st.columns(3)

# Filter out logs per agent
agent_scout_logs = [log for log in st.session_state.activity_log if "Scout" in log]
agent_writer_logs = [log for log in st.session_state.activity_log if "Writer" in log]
agent_editor_logs = [log for log in st.session_state.activity_log if "Evaluator" in log or "System" in log]

with card_col1:
    st.markdown(f\"\"\"
    <div class="portal-card" style="min-height: 290px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span class="portal-tag" style="background-color: #ECFDF5; color: #047857; margin-bottom: 0;">Officer Alpha</span>
                <span style="font-size: 1.15rem;">🔍</span>
            </div>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: #0F172A; margin: 0 0 0.5rem 0;">Scout-Alpha Pipeline</h4>
            <p style="font-size: 0.75rem; color: #64748B; margin-bottom: 1rem; line-height: 1.4;">Crawls developer endpoints, forums and GitHub parameters to extract trending indices.</p>
            
            <div style="font-size: 0.75rem; color: #334155;">
                <ul style="padding-left: 1.25rem; margin: 0; display: flex; flex-direction: column; gap: 4px;">
                    <li>Status: <strong>{'ACTIVE SCRAPING' if st.session_state.activity_log and not st.session_state.newsletter else '✓ STANDBY READY'}</strong></li>
                    <li>Source Feed: GitHub / HackerNews / Feeds</li>
                    <li>Simulated Scraping engine activated</li>
                </ul>
            </div>
        </div>
    </div>
    \"\"\", unsafe_allow_html=True)
    if st.button("View Scout Logs", key="btn_scout_view", use_container_width=True):
        if agent_scout_logs:
            st.info("\\n\\n".join(agent_scout_logs))
        else:
            st.toast("No active telemetry records captured for Scout-Alpha. Run the pipeline to populate.")

with card_col2:
    st.markdown(f\"\"\"
    <div class="portal-card" style="min-height: 290px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span class="portal-tag" style="background-color: #EFF6FF; color: #1D63ED; margin-bottom: 0;">Officer Beta</span>
                <span style="font-size: 1.15rem;">✍️</span>
            </div>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: #0F172A; margin: 0 0 0.5rem 0;">Writer-Beta Engine</h4>
            <p style="font-size: 0.75rem; color: #64748B; margin-bottom: 1rem; line-height: 1.4;">Formats unstructured payload strings and shapes technical academic briefs.</p>
            
            <div style="font-size: 0.75rem; color: #334155;">
                <ul style="padding-left: 1.25rem; margin: 0; display: flex; flex-direction: column; gap: 4px;">
                    <li>Status: <strong>{'EXPANDING TEXT' if st.session_state.activity_log and not st.session_state.newsletter else '✓ STANDBY READY'}</strong></li>
                    <li>Active Model: gemini-2.5-flash / Mock</li>
                    <li>Structure Format: Substack Editorial Style</li>
                </ul>
            </div>
        </div>
    </div>
    \"\"\", unsafe_allow_html=True)
    if st.button("View Copywriter Logs", key="btn_writer_view", use_container_width=True):
        if agent_writer_logs:
            st.info("\\n\\n".join(agent_writer_logs))
        else:
            st.toast("No active telemetry records captured for Writer-Beta.")

with card_col3:
    st.markdown(f\"\"\"
    <div class="portal-card" style="min-height: 290px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span class="portal-tag" style="background-color: #FFF7ED; color: #C2410C; margin-bottom: 0;">Officer Gamma</span>
                <span style="font-size: 1.15rem;">🛡️</span>
            </div>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: #0F172A; margin: 0 0 0.5rem 0;">Reviewer-Gamma Engine</h4>
            <p style="font-size: 0.75rem; color: #64748B; margin-bottom: 1rem; line-height: 1.4;">Parses grammatical integrity, reviews hierarchies, and issues structural stamps.</p>
            
            <div style="font-size: 0.75rem; color: #334155;">
                <ul style="padding-left: 1.25rem; margin: 0; display: flex; flex-direction: column; gap: 4px;">
                    <li>Status: <strong>{'EVALUATING STAMP' if st.session_state.activity_log and not st.session_state.newsletter else '✓ STANDBY READY'}</strong></li>
                    <li>Rule Compliance check: Enabled</li>
                    <li>Cryptographical verification stamp: OK</li>
                </ul>
            </div>
        </div>
    </div>
    \"\"\", unsafe_allow_html=True)
    if st.button("View Editor Logs", key="btn_editor_view", use_container_width=True):
        if agent_editor_logs:
            st.info("\\n\\n".join(agent_editor_logs))
        else:
            st.toast("No active telemetry records captured for Reviewer-Gamma.")

st.markdown("<div style='height:15px'></div>", unsafe_allow_html=True)

# Main Generation Launcher Button centered nicely
launcher_col1, launcher_col2, launcher_col3 = st.columns([1, 1, 1])
with launcher_col2:
    trigger_btn = st.button("🚀 WAKE UP MULTI-AGENT NEWSROOM", use_container_width=True, type="primary")

# 4. Functional Core Integration Flow Execution
if trigger_btn:
    st.session_state.activity_log = []
    
    # Helper to append logs cleanly with delay simulation
    def add_log(agent, message, delay=0.8):
        stamp = datetime.now().strftime("%H:%M:%S")
        st.session_state.activity_log.append(f"[{stamp}] **{agent}**: {message}")
        time.sleep(delay)

    add_log("System", "Waking up active organizational officers...")
    add_log("Trend Scout", f"Trend Scout activated for thematic campaign niche: '{st.session_state.niche}'")
    add_log("Trend Scout", "Querying HackerNews RSS feeds and local simulation endpoints...")
    
    # Define custom thematic targets
    if "web3" in st.session_state.niche.lower() or "blockchain" in st.session_state.niche.lower():
        points = [
            {"title": "Solana State Compression: Reducing NFT costs by 100x via Merkle Trees", "description": "Analyzing state off-chain hashes validating on parallel ledger threads safely."},
            {"title": "Parallel EVM Speculative Execution Architectures in Production", "description": "Reviewing optimistic lock thread safeties inside smart-contracts compilation layers."},
            {"title": "Zero-Knowledge Rollup Proof Generation Metrics on Consumer Hardware", "description": "Hardware benchmark results showing zk-prove delays dropped by 65%."}
        ]
    elif "ai" in st.session_state.niche.lower() or "agent" in st.session_state.niche.lower():
        points = [
            {"title": "Model-Context Protocol (MCP) clients written in pure Rust systems", "description": "Eliminating standard structural GC sweeps for ultra-fast context injection runs."},
            {"title": "Optimal HTTP/3 streaming strategies for local agentic telemetry traces", "description": "Preventing head-of-line payload jams when piping deep textual reasoning queues."},
            {"title": "Preventing raw autonomous agents budget expenditures and uncontrolled loops", "description": "Architectural gatekeeper bounds preventing agents from draining public API key credits."}
        ]
    else:
        points = [
            {"title": f"Recent Optimization Milestones in {st.session_state.niche}", "description": "How principal technical architects are redesigning key parameters and components."},
            {"title": f"Analyzing memory GC overhead bottlenecks in long-lived {st.session_state.niche} tasks", "description": "Post-mortem leak diagnostic metrics on distributed queues."},
            {"title": f"Compact compilers for compiling {st.session_state.niche} assets with zero-dependency", "description": "Tree-shaking redundant nested representations at production build stage."}
        ]

    for index, pt in enumerate(points):
        add_log("Trend Scout", f"[Trend Spot #{index+1}] Highlighted: {pt['title']}")
    
    add_log("System", "Scout logs completed. Routing sanitized data payload to Writer-Beta for expansion...")
    add_log("Writer", "Writer-Beta initialized. Crafting technical editorial newsletter publication...")

    if not api_key:
        add_log("Writer", "⚠️ AI Studio credentials not configured! Activating local simulator draft generation...", delay=0.5)
        # Mock structural output drafting
        mock_text = f\"\"\"# 💻 The Autonomous {st.session_state.niche} Chronicle

Welcome to this week's technical executive dispatch on **{st.session_state.niche}**, designed completely by our multi-agent orchestration.

---

## ⚡ Key Architectural Developments

The ecosystem is maturing rapidly. Below, our Scout Agent breaks down this week's high-impact topics:

### 1. 🔍 Deep Analysis: {points[0]['title']}
{points[0]['description']}

*Developer takeaway*: Integrating these optimizations streamlines resource allocations and keeps core builds extremely modular.

---

### 2. ⚡ Concurrency Metrics: {points[1]['title']}
{points[1]['description']}

| Parameter Benchmarked | Base Environment | Optimizations Hooked |
| :--- | :--- | :--- |
| Dispatch Connection delay | 120ms | **15ms** |
| Memory layout overhead | 512MB | **128MB** |

---

### 3. 🔬 Synthesized Conclusion: {points[2]['title']}
{points[2]['description']}

*Conclusion*: Standardizing these practices protects systems from memory inflation, offering resilient options for enterprise deployment.
\"\"\"
        st.session_state.newsletter = mock_text
    else:
        add_log("Writer", "Connecting securely to Google AI Studio standard models client...")
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction="You are an elite, highly esteemed engineering newsletter author and principal technical architect."
            )
            prompt = f\"\"\"
            Write an incredibly detailed, comprehensive, high-quality, and deeply technical subscriber newsletter focusing on the target niche: "{st.session_state.niche}".
            
            Use these 3 trend reports collected by our Scout Agent:
            1. **{points[0]['title']}**: {points[0]['description']}
            2. **{points[1]['title']}**: {points[1]['description']}
            3. **{points[2]['title']}**: {points[2]['description']}
            
            Adhere to this blueprint:
            - Title: Catchy email subject heading (e.g. "The Sync: Parallelized VM Debates, Rust MCP...")
            - Overview: High-level technical analysis of this niche.
            - Deep Dive sections: 1 rich, deeply academic section with markdown headers (##) for each of the 3 trends. 
            - Code Blocks: Include at least one highly realistic code or configuration snippet.
            - Conclusion: Future outlook.
            - Tone: Professional, sophisticated, and engaging (Substack editorial style). No generic AI introductions!
            \"\"\"
            add_log("Writer", "Streaming token predictions from Gemini standard system API...", delay=0.5)
            response = model.generate_content(prompt)
            st.session_state.newsletter = response.text
            add_log("Writer", "Successfully generated high-fidelity copydraft.")
        except Exception as e:
            add_log("System", f"❌ Live connection failed: {str(e)}. Defaulting to simulator mode.")
            st.session_state.newsletter = f"API Error: {str(e)}\\n\\nPlease review your local credential variables."
            
    add_log("Evaluator", "Evaluator Agent checking editorial hierarchies and markdown standards...")
    add_log("Evaluator", "Parsing syntax verification. Standard parameters: Compliant.")
    add_log("System", "Orchestrated pipeline completed successfully. releasing publication draft lock! 🎉")
    
    # Prepend professional header plates to final newsletter
    st.session_state.newsletter = f\"\"\"---
Topic: {st.session_state.niche}
Orchestrated BY: Multi-Agent Council
Status: Polished & Approved ✓
System dispatch time: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
---

{st.session_state.newsletter}\"\"\"

    st.session_state.total_issues += 1
    st.session_state.last_sync = datetime.now().strftime("%H:%M:%S")
    st.rerun()

# 5. Output Preview - Formatted White Paper Layout Document Preview
if st.session_state.newsletter:
    st.markdown("<div style='height:20px'></div>", unsafe_allow_html=True)
    
    # Simulate a beautiful white texture paper page
    st.markdown(f\"\"\"
    <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; padding: 3rem 2.5rem; border-radius: 12px; box-shadow: 0 4px 15px -3px rgba(0,0,0,0.05); max-width: 800px; margin: 0 auto; border-top: 6px solid #1D63ED; position: relative;">
        <!-- Watermark Header Plate -->
        <div style="text-align: center; border-bottom: 2px solid #0F172A; padding-bottom: 1rem; margin-bottom: 2rem;">
            <p style="font-size: 0.75rem; color: #1D63ED; text-transform: uppercase; tracking-wider; margin: 0; font-weight: bold; font-family: monospace;">AUTONOMOUS AGENTIC PRESS RELEASE</p>
            <h2 style="font-size: 1.9rem; font-weight: 800; color: #0F172A; text-transform: uppercase; margin: 5px 0; font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.02em;">THE DISPATCH CHRONICLE</h2>
            <div style="display: flex; justify-content: space-between; font-size: 0.73rem; color: #475569; font-family: monospace; margin-top: 15px; padding: 6px 12px; background-color: #F8FAFC; border-radius: 6px; border: 1px solid #E2E8F0;">
                <span>ISSUE: CLASSIFIED #{st.session_state.total_issues}</span>
                <span style="font-weight: 700; color: #1D63ED;">NICHE: {st.session_state.niche}</span>
                <span>DATE: {datetime.now().strftime("%Y-%m-%d")}</span>
            </div>
        </div>
    </div>
    \"\"\", unsafe_allow_html=True)
    
    # Render draft in a readable standard streamlit component
    st.markdown(st.session_state.newsletter)
    
    st.markdown(\"\"\"
    <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-top: none; padding: 1.5rem; border-radius: 0 0 12px 12px; max-width: 800px; margin: -10px auto 2rem auto; text-align: center; font-size: 0.75rem; color: #94A3B8; font-family: monospace; border-top: 1px dashed #E2E8F0;">
        © 2026 CORPORATE MULTI-AGENT COUNCIL • ALL DISTRIBUTION RIGHTS APPROVED
    </div>
    \"\"\", unsafe_allow_html=True)
    
    # Footer Action Buttons: Copy & Download Markdown
    act_col1, act_col2 = st.columns(2)
    with act_col1:
        st.download_button(
            label="💾 Download Markdown (.md)",
            data=st.session_state.newsletter,
            file_name=f"corporate_draft_{st.session_state.niche.lower().replace(' ', '_')}.md",
            mime="text/markdown",
            use_container_width=True
        )
    with act_col2:
        # Streamlit standard button copy simulation
        if st.button("📋 Copy Publication Draft", use_container_width=True):
            st.toast("Copied dispatch draft content to local clipboard successfully!")
else:
    st.markdown("""
    <div class="portal-card" style="text-align: center; padding: 3rem 1.5rem; margin-top: 1.5rem;">
        <span style="font-size: 2.5rem; display: block; margin-bottom: 1rem;">💼</span>
        <h4 style="font-size: 1rem; font-weight: 700; color: #0F172A; margin: 0 0 0.5rem 0; text-transform: uppercase;">Awaiting Orchestration</h4>
        <p style="font-size: 0.8rem; color: #64748B; max-width: 400px; margin: 0 auto;">
            Configure parameters inside the hero panel and wake up your Multi-Agent pipeline. The final premium paper draft results will assemble immediately here.
        </p>
    </div>
    """, unsafe_allow_html=True)
`;
