import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  Bot,
  Sparkles,
  Cpu,
  Clock,
  TrendingUp,
  Download,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  Eye,
  Edit,
  FileCode,
  ShieldAlert,
  Server,
  RefreshCw,
  Sliders,
  CheckCircle2
} from "lucide-react";
import { pythonStreamlitCode } from "./python_template";

// Preset niches for instant selection
const NICHE_PRESETS = [
  "AI & Agentic Frameworks",
  "Web3 Development & Smart Contracts",
  "Rust Systems & WebAssembly",
  "Edge AI & Distributed Compute"
];

interface LogEntry {
  agent: string;
  message: string;
  timestamp: string;
}

interface BackendStats {
  totalIssuesGenerated: number;
  lastSyncTime: string;
  activeAgents: string[];
}

export default function App() {
  // Input Config state
  const [apiKey, setApiKey] = useState("");
  const [niche, setNiche] = useState("AI & Agentic Frameworks");
  
  // Dashboard state
  const [stats, setStats] = useState<BackendStats>({
    totalIssuesGenerated: 0,
    lastSyncTime: "Never",
    activeAgents: ["Trend Scout Agent", "Writer Agent", "Evaluator Agent"]
  });
  const [hasServerKey, setHasServerKey] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "code">("dashboard");
  const [previewMode, setPreviewMode] = useState<"preview" | "raw">("preview");

  // Output states
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [visibleLogs, setVisibleLogs] = useState<LogEntry[]>([]);
  const [newsletter, setNewsletter] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Copy success animation states
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch initial system status
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setHasServerKey(data.hasServerKey);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to load backend status:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Handle pipeline generation trigger
  const runAgentPipeline = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setErrorMsg("");
    setNewsletter("");
    setLogs([]);
    setVisibleLogs([]);

    try {
      // Post request
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          customApiKey: apiKey.trim() || undefined
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Generation Failed");
      }

      // Simulate a real-time stream feel by rolling out logs sequentially with staggering timeouts
      const fullLogs = data.logs || [];
      setLogs(fullLogs);

      let logIndex = 0;
      const revealNextLog = () => {
        if (logIndex < fullLogs.length) {
          setVisibleLogs((prev) => [...prev, fullLogs[logIndex]]);
          logIndex++;
          setTimeout(revealNextLog, 750); // delay between log steps
        } else {
          // Completed stream. Display newsletter content and update metrics
          setNewsletter(data.newsletter || "");
          if (data.stats) {
            setStats(data.stats);
          }
          setIsGenerating(false);
        }
      };

      revealNextLog();

    } catch (err: any) {
      console.error("Pipeline run error:", err);
      setErrorMsg(err.message || "Pipeline execution failed");
      setIsGenerating(false);
    }
  };

  // Scroll terminal logs automatically
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [visibleLogs]);

  // Download Markdown draft helper
  const downloadMarkdown = () => {
    if (!newsletter) return;
    const blob = new Blob([newsletter], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const sanitizedNiche = niche.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    link.setAttribute("download", `autonomous_newsletter_${sanitizedNiche}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download Streamlit Python app helper
  const downloadPythonScript = () => {
    const blob = new Blob([pythonStreamlitCode], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "app.py");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, isMd: boolean) => {
    navigator.clipboard.writeText(text);
    if (isMd) {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Determine current active agent phase for styling indicators
  const getActiveAgentIndex = () => {
    if (!isGenerating) return -1;
    const lastLog = visibleLogs[visibleLogs.length - 1];
    if (!lastLog) return 0; // System startup index
    if (lastLog.agent === "Trend Scout") return 0;
    if (lastLog.agent === "Writer") return 1;
    if (lastLog.agent === "Evaluator") return 2;
    return -1;
  };

  const activeAgentIndex = getActiveAgentIndex();

  const handlePresetClick = (preset: string) => {
    if (isGenerating) return;
    setNiche(preset);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-40 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600/10 p-2 rounded-xl border border-indigo-500/20">
            <Bot className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
              Autonomous Content Engine
            </h1>
            <p className="text-xs text-slate-400">Off-Grid Multi-Agent Publisher Control Panel</p>
          </div>
        </div>
        
        {/* Tab Switches */}
        <div className="flex gap-2 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${
              activeTab === "dashboard"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            Control Dashboard
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${
              activeTab === "code"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            Streamlit Python Code (app.py)
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Hand Sidebar configuration controls */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/50 border border-slate-900 rounded-2xl p-5 space-y-6 backdrop-blur">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Sliders className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-bold font-display uppercase tracking-wider text-slate-200">
                Configurations
              </h2>
            </div>

            {/* API Key text Input */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">
                Gemini API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasServerKey ? "Using Active Server Secret (Preset) ••••" : "Insert AI Studio Gemini Key..."}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-all"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {hasServerKey 
                  ? "✓ Back-end server secret key detected. Leave blank to run automatically."
                  : "💡 Runs in offline Simulation mode if blank. Paste key to enable live generation."}
              </p>
            </div>

            {/* Target Niche text input */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">
                Target Niche Focus
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={isGenerating}
                placeholder="e.g. AI Agents, Web3 Protocols..."
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition-all disabled:opacity-50"
              />
            </div>

            {/* Presets Grid */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">
                Quick Selection Presets
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {NICHE_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePresetClick(p)}
                    disabled={isGenerating}
                    className={`text-left px-3 py-2 rounded-lg text-[11px] transition-all border ${
                      niche === p
                        ? "bg-indigo-600/15 border-indigo-500/40 text-indigo-200 font-medium"
                        : "bg-slate-950/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    } disabled:opacity-50`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Manual wake-up button */}
            <button
              onClick={runAgentPipeline}
              disabled={isGenerating || !niche.trim()}
              className={`w-full py-3 px-4 rounded-xl font-medium text-xs transition-all flex items-center justify-center gap-2 border shadow-lg ${
                isGenerating
                  ? "bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-500 hover:brightness-110 active:scale-[0.98] text-white shadow-indigo-600/10"
              }`}
            >
              <Sparkles className={`h-4 w-4 ${isGenerating ? "animate-spin text-slate-400" : "text-indigo-200"}`} />
              Wake Up Trend Scout Agent
            </button>
          </div>

          {/* Offline Agent Architecture Blueprint Map */}
          <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-4 space-y-4 text-xs">
            <h3 className="font-bold font-display text-slate-300 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              Agent Workflow pipeline
            </h3>
            <div className="relative pl-4 border-l border-slate-800 space-y-4">
              {/* Step 1 */}
              <div className="relative">
                <div className={`absolute -left-[21px] top-0.5 w-[9px] h-[9px] rounded-full border ${
                  activeAgentIndex === 0 
                  ? "bg-emerald-400 border-emerald-500 animate-pulse" 
                  : "bg-slate-800 border-slate-700"
                }`} />
                <p className={`font-semibold ${activeAgentIndex === 0 ? "text-indigo-300" : "text-slate-300"}`}>
                  1. Agent A (Trend Scout)
                </p>
                <p className="text-[10px] text-slate-500">Scans tech rss feeds for engagement hotspots.</p>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className={`absolute -left-[21px] top-0.5 w-[9px] h-[9px] rounded-full border ${
                  activeAgentIndex === 1 
                  ? "bg-indigo-400 border-indigo-500 animate-pulse" 
                  : "bg-slate-800 border-slate-700"
                }`} />
                <p className={`font-semibold ${activeAgentIndex === 1 ? "text-indigo-300" : "text-slate-300"}`}>
                  2. Agent B (The Writer)
                </p>
                <p className="text-[10px] text-slate-500">Generates structured newsletter template on Gemini.</p>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className={`absolute -left-[21px] top-0.5 w-[9px] h-[9px] rounded-full border ${
                  activeAgentIndex === 2 
                  ? "bg-violet-400 border-violet-500 animate-pulse" 
                  : "bg-slate-800 border-slate-700"
                }`} />
                <p className={`font-semibold ${activeAgentIndex === 2 ? "text-indigo-300" : "text-slate-300"}`}>
                  3. Agent C (The Evaluator)
                </p>
                <p className="text-[10px] text-slate-500">Performs review, verifies quality checks, approves release.</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right main area */}
        <main className="lg:col-span-3 space-y-6">

          {/* Live system metrics overview Row */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 space-y-1">
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Total Issues Drafted</p>
              <div className="flex items-center justify-between text-white">
                <span className="text-2xl font-bold font-display">{stats.totalIssuesGenerated}</span>
                <TrendingUp className="h-5 w-5 text-indigo-400/80" />
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 space-y-1">
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Active Agency</p>
              <div className="flex items-center justify-between text-white">
                <span className="text-sm font-semibold truncate">3 Orchestration Agents</span>
                <Bot className="h-5 w-5 text-indigo-400/80" />
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 space-y-1">
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Last Sync Run</p>
              <div className="flex items-center justify-between text-white">
                <span className="text-xs font-mono font-medium truncate">
                  {stats.lastSyncTime === "Never" 
                    ? "Never" 
                    : new Date(stats.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  }
                </span>
                <Clock className="h-5 w-5 text-indigo-400/80" />
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 space-y-1">
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Pipeline Connection</p>
              <div className="flex items-center justify-between text-white">
                <span className="text-xs font-semibold flex items-center gap-1">
                  {hasServerKey || apiKey ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Gemini Online
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-slate-500" />
                      Simulation Mode
                    </>
                  )}
                </span>
                <Server className="h-5 w-5 text-indigo-400/80" />
              </div>
            </div>

          </section>

          {/* Action Tabs Content */}
          {activeTab === "dashboard" ? (
            <div className="space-y-6">
              
              {/* Main Workspace Layout (2 columns: Stream, Newsletter Draft) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Terminal stream box */}
                <div className="bg-slate-950 border border-slate-900 rounded-2xl flex flex-col h-[540px] shadow-2xl relative overflow-hidden">
                  
                  {/* Terminal Header */}
                  <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-900 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="text-xs font-mono font-medium text-slate-300">live-agent-stream.sh</span>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-800" />
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-800" />
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-800" />
                    </div>
                  </div>

                  {/* Terminal Lines Container */}
                  <div className="p-4 flex-1 overflow-y-auto space-y-3 font-mono text-xs leading-relaxed max-h-[480px]">
                    {visibleLogs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6 space-y-3">
                        <Terminal className="h-8 w-8 text-slate-700" />
                        <p className="max-w-xs text-xs">
                          Terminal idle. Adjust tech focus, then trigger the <strong>Wake Up Trend Scout Agent</strong> configuration panel to stream multi-agent logs.
                        </p>
                      </div>
                    ) : (
                      visibleLogs.map((log, index) => {
                        let colorClasses = "text-indigo-400";
                        if (log.agent === "Trend Scout") colorClasses = "text-emerald-400";
                        if (log.agent === "Evaluator") colorClasses = "text-violet-400";
                        if (log.agent === "System") colorClasses = "text-amber-400";

                        return (
                          <div
                            key={index}
                            className="border-l-2 border-indigo-500/20 pl-3.5 py-1 hover:bg-slate-900/30 rounded transition-all duration-150 animate-fadeIn"
                          >
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-0.5">
                              <span>[{log.timestamp}]</span>
                              <span className={`font-semibold ${colorClasses}`}>{log.agent}</span>
                            </div>
                            <p className="text-slate-300 font-mono text-xs select-text">{log.message}</p>
                          </div>
                        );
                      })
                    )}
                    <div ref={logsEndRef} />
                  </div>

                  {errorMsg && (
                    <div className="m-4 p-3 bg-red-950/40 border border-red-900 rounded-xl text-red-200 text-xs flex gap-2.5 select-text">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                      <div>
                        <p className="font-semibold">Pipeline Exception</p>
                        <p className="opacity-90">{errorMsg}</p>
                      </div>
                    </div>
                  )}

                  {isGenerating && (
                    <div className="absolute bottom-4 right-4 bg-indigo-900/60 border border-indigo-500/20 backdrop-blur rounded-full px-3.5 py-1.5 text-[10px] text-indigo-200 flex items-center gap-2 shadow-lg">
                      <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                      <span>Agents active...</span>
                    </div>
                  )}
                </div>

                {/* 2. Draft Editor and View */}
                <div className="bg-slate-950 border border-slate-900 rounded-2xl flex flex-col h-[540px] shadow-2xl relative">
                  
                  {/* View Header */}
                  <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-900 flex items-center justify-between shrink-0">
                    <span className="text-xs font-semibold text-slate-300">📰 Newsletter Draft Output</span>
                    
                    {/* Preview / Edit Toggle */}
                    {newsletter && (
                      <div className="flex gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                        <button
                          onClick={() => setPreviewMode("preview")}
                          className={`p-1 px-2.5 rounded text-[11px] flex items-center gap-1 transition-all ${
                            previewMode === "preview"
                              ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </button>
                        <button
                          onClick={() => setPreviewMode("raw")}
                          className={`p-1 px-2.5 rounded text-[11px] flex items-center gap-1 transition-all ${
                            previewMode === "raw"
                              ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <Edit className="h-3 w-3" />
                          Edit Code
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4 flex-1 overflow-y-auto max-h-[480px]">
                    {!newsletter ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2 p-6">
                        <Bot className="h-10 w-10 text-slate-800" />
                        <p className="text-xs max-w-xs">
                          Draft is compiled in markdown as soon as the three agents finish the telemetry flow and approve the draft details.
                        </p>
                      </div>
                    ) : (
                      <>
                        {previewMode === "preview" ? (
                          <div className="markdown-render space-y-4 text-xs font-sans select-text leading-relaxed p-2">
                            {/* Simple Markdown preview blocks parser to simulate elegant rendering */}
                            {newsletter.split("\n\n").map((block, i) => {
                              if (block.startsWith("---")) {
                                return <div key={i} className="border-y border-slate-800 py-2.5 my-3 bg-slate-900/20 px-3 rounded-lg text-[10px] font-mono text-slate-400" />;
                              }
                              if (block.startsWith("# ")) {
                                return (
                                  <h1 key={i} className="text-lg font-bold font-display text-white mt-4 border-b border-slate-900 pb-1.5">
                                    {block.replace("# ", "")}
                                  </h1>
                                );
                              }
                              if (block.startsWith("## ")) {
                                return (
                                  <h2 key={i} className="text-xs font-bold font-display text-indigo-300 uppercase tracking-wide mt-5">
                                    {block.replace("## ", "")}
                                  </h2>
                                );
                              }
                              if (block.startsWith("### ")) {
                                return (
                                  <h3 key={i} className="text-xs font-semibold text-slate-200 mt-3 flex items-center gap-1.5">
                                    <Sparkles className="h-3 w-3 text-indigo-400" />
                                    {block.replace("### ", "")}
                                  </h3>
                                );
                              }
                              if (block.startsWith("- ") || block.startsWith("* ")) {
                                return (
                                  <ul key={i} className="list-disc pl-5 space-y-1 my-2">
                                    {block.split("\n").map((li, idx) => (
                                      <li key={idx}>{li.replace(/^[\s-*]+/, "")}</li>
                                    ))}
                                  </ul>
                                );
                              }
                              if (block.startsWith("```")) {
                                const lines = block.split("\n");
                                const codeBlock = lines.slice(1, -1).join("\n");
                                return (
                                  <pre key={i} className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-[10px] text-slate-300 overflow-x-auto whitespace-pre my-3">
                                    <code>{codeBlock}</code>
                                  </pre>
                                );
                              }
                              return <p key={i} className="text-slate-300">{block}</p>;
                            })}
                          </div>
                        ) : (
                          <textarea
                            value={newsletter}
                            onChange={(e) => setNewsletter(e.target.value)}
                            className="w-full h-full bg-slate-950 text-slate-300 font-mono text-xs border-0 focus:ring-0 resize-none focus:outline-none p-2 select-text"
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions footer for newsletter draft */}
                  {newsletter && (
                    <div className="px-4 py-3 bg-slate-900/40 border-t border-slate-900 flex gap-3 shrink-0">
                      <button
                        onClick={downloadMarkdown}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/15"
                      >
                        <Download className="h-4 w-4" />
                        Download Draft (.md)
                      </button>
                      
                      <button
                        onClick={() => copyToClipboard(newsletter, true)}
                        className="p-2 border border-slate-800 hover:border-slate-700 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white rounded-xl transition-all"
                        title="Copy Markdown Clipboard"
                      >
                        {copiedMd ? <Check className="h-4 w-4 text-emerald-400 animate-scaleIn" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  )}

                </div>

              </div>

            </div>
          ) : (
            /* Streamlit python script copy-paste view page */
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 space-y-6 shadow-2xl relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-5">
                <div>
                  <h2 className="text-md font-bold font-display text-white flex items-center gap-2">
                    <FileCode className="h-5 w-5 text-indigo-400" />
                    Off-Grid Streamlit Dashboard Code
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">
                    Export the full multi-agent simulation workflow code to play locally on your personal desktop or laptop machine.
                  </p>
                </div>
                
                {/* Script Download Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(pythonStreamlitCode, false)}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-medium text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-2"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-400" />
                        Copied Script!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 text-slate-400" />
                        Copy Python Code
                      </>
                    )}
                  </button>
                  <button
                    onClick={downloadPythonScript}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/15"
                  >
                    <Download className="h-4 w-4" />
                    Download app.py
                  </button>
                </div>
              </div>

              {/* Guide card setup */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 flex items-center justify-center bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold rounded-lg text-[10px]">
                      1
                    </span>
                    <strong className="text-slate-300">Set Up Workspace</strong>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Install local required workspace environments using standard pip packet commands:
                  </p>
                  <code className="block bg-slate-950 p-2 border border-slate-900 rounded text-[10px] text-indigo-400 select-all font-mono">
                    pip install streamlit google-generativeai
                  </code>
                </div>

                <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 flex items-center justify-center bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold rounded-lg text-[10px]">
                      2
                    </span>
                    <strong className="text-slate-300">Save Local Code File</strong>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Download or copy the raw Python source code block displayed below and save it as:
                  </p>
                  <code className="block bg-slate-950 p-2 border border-slate-900 rounded text-[10px] text-indigo-400 font-mono">
                    app.py
                  </code>
                </div>

                <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 flex items-center justify-center bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold rounded-lg text-[10px]">
                      3
                    </span>
                    <strong className="text-slate-300">Launch stream Server</strong>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Boot the Streamlit web framework environment page from your CMD/Terminal prompt:
                  </p>
                  <code className="block bg-slate-950 p-2 border border-slate-900 rounded text-[10px] text-indigo-400 select-all font-mono">
                    streamlit run app.py
                  </code>
                </div>
              </div>

              {/* Code window */}
              <div className="relative">
                <div className="absolute right-3 top-3 z-10 flex gap-1 bg-slate-950/80 p-1 border border-slate-900 rounded-lg">
                  <button
                    onClick={() => copyToClipboard(pythonStreamlitCode, false)}
                    className="p-1 px-2 hover:bg-slate-900 text-[10px] text-slate-400 hover:text-white rounded transition-all flex items-center gap-1"
                    title="Copy Python Code"
                  >
                    {copiedCode ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedCode ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                
                <pre className="bg-slate-950 p-5 rounded-2xl border border-slate-900 overflow-x-auto text-[11px] font-mono leading-relaxed text-slate-300 max-h-[500px]">
                  <code className="select-text">{pythonStreamlitCode}</code>
                </pre>
              </div>

            </div>
          )}

        </main>

      </div>
    </div>
  );
}
