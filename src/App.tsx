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
  CheckCircle2,
  Trash2,
  Search,
  Archive,
  Save,
  History,
  Radio,
  Globe,
  Layers,
  Calendar,
  Sun,
  Moon,
  Monitor
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

interface SavedNewsletter {
  id: string;
  niche: string;
  timestamp: string;
  content: string;
  logs: LogEntry[];
}

export default function App() {
  // Theme state and management
  type Theme = "light" | "dark" | "system";

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("autonomous_newsletter_theme") as Theme) || "system";
    }
    return "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (currentTheme: Theme) => {
      root.classList.remove("light", "dark");

      if (currentTheme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        root.classList.add(systemTheme);
      } else {
        root.classList.add(currentTheme);
      }
    };

    applyTheme(theme);
    localStorage.setItem("autonomous_newsletter_theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");

      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }
  }, [theme]);

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

  // Local storage history state
  const [historyList, setHistoryList] = useState<SavedNewsletter[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  // Copy success animation states
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  // Track open log modal for precise agent operations
  const [activeLogModal, setActiveLogModal] = useState<"scout" | "writer" | "editor" | null>(null);

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
    // Load local history from browser localStorage
    try {
      const stored = localStorage.getItem("autonomous_newsletter_history");
      if (stored) {
        setHistoryList(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load saved newsletter history:", e);
    }
  }, []);

  // Handle pipeline generation trigger
  const runAgentPipeline = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setErrorMsg("");
    setNewsletter("");
    setLogs([]);
    setVisibleLogs([]);
    setSelectedHistoryId(null);

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
          const draftText = data.newsletter || "";
          setNewsletter(draftText);
          if (data.stats) {
            setStats(data.stats);
          }
          setIsGenerating(false);

          // Save completed pipeline run into browser local history
          if (draftText) {
            const newRecord: SavedNewsletter = {
              id: Date.now().toString(),
              niche: niche,
              timestamp: new Date().toISOString(),
              content: draftText,
              logs: fullLogs
            };
            setHistoryList((prev) => {
              const updated = [newRecord, ...prev];
              localStorage.setItem("autonomous_newsletter_history", JSON.stringify(updated));
              return updated;
            });
            setSelectedHistoryId(newRecord.id);
          }
        }
      };

      revealNextLog();

    } catch (err: any) {
      console.error("Pipeline run error:", err);
      setErrorMsg(err.message || "Pipeline execution failed");
      setIsGenerating(false);
    }
  };

  // Load an existing history draft snapshot
  const loadHistoryItem = (item: SavedNewsletter) => {
    if (isGenerating) return;
    setSelectedHistoryId(item.id);
    setNiche(item.niche);
    setNewsletter(item.content);

    // Pour history logs back into terminal stream instantly
    if (item.logs && item.logs.length > 0) {
      setLogs(item.logs);
      setVisibleLogs(item.logs);
    } else {
      const mockHistoryLogs: LogEntry[] = [
        {
          agent: "System",
          message: `Loaded historical snapshot campaign from browser local storage archives.`,
          timestamp: new Date(item.timestamp).toLocaleTimeString()
        },
        {
          agent: "Evaluator",
          message: `Topic niche: "${item.niche}" restored. Ready for export.`,
          timestamp: new Date(item.timestamp).toLocaleTimeString()
        }
      ];
      setLogs(mockHistoryLogs);
      setVisibleLogs(mockHistoryLogs);
    }
  };

  // Delete a newsletter from history list
  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistoryList((prev) => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem("autonomous_newsletter_history", JSON.stringify(updated));
      return updated;
    });
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
      setNewsletter("");
      setVisibleLogs([]);
    }
  };

  // Save changes from editing screen back to active local history item
  const saveNewsletterChanges = () => {
    if (!newsletter) return;

    if (selectedHistoryId) {
      setHistoryList((prev) => {
        const updated = prev.map(item => {
          if (item.id === selectedHistoryId) {
            return {
              ...item,
              content: newsletter,
              timestamp: new Date().toISOString()
            };
          }
          return item;
        });
        localStorage.setItem("autonomous_newsletter_history", JSON.stringify(updated));
        return updated;
      });
      setSaveSuccessMsg("Draft Updated!");
      setTimeout(() => setSaveSuccessMsg(""), 2000);
    } else {
      // Create a new customized manual snapshot
      const newId = Date.now().toString();
      const newRecord: SavedNewsletter = {
        id: newId,
        niche: niche || "Custom Snapshot Focus",
        timestamp: new Date().toISOString(),
        content: newsletter,
        logs: [
          {
            agent: "System",
            message: "Customized manual draft save snap created into active memory archives.",
            timestamp: new Date().toLocaleTimeString()
          }
        ]
      };
      setHistoryList((prev) => {
        const updated = [newRecord, ...prev];
        localStorage.setItem("autonomous_newsletter_history", JSON.stringify(updated));
        return updated;
      });
      setSelectedHistoryId(newId);
      setSaveSuccessMsg("Snap Saved!");
      setTimeout(() => setSaveSuccessMsg(""), 2000);
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

  const filteredHistory = historyList.filter(item => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      item.niche.toLowerCase().includes(query) ||
      item.content.toLowerCase().includes(query)
    );
  });

  // Filter out logs per agent for structured grid checklists
  const agentScoutLogs = visibleLogs.filter(log => log.agent === "Trend Scout");
  const agentWriterLogs = visibleLogs.filter(log => log.agent === "Writer");
  const agentEditorLogs = visibleLogs.filter(log => log.agent === "Evaluator" || log.agent === "System");

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans selection:bg-blue-500/10 dark:selection:bg-blue-600/20 selection:text-blue-700 dark:selection:text-blue-400 transition-colors duration-200">

      {/* 2. Professional Header (Navigation Bar Simulation) */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-40 px-4 sm:px-6 py-4 flex flex-col lg:flex-row justify-between items-center gap-4 shadow-xs transition-colors duration-200">
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl overflow-hidden shadow-md shrink-0 border border-slate-100 dark:border-slate-800 bg-[#1D63ED]">
              <img
                src="/src/assets/images/newsletter_logo_1781618675903.jpg"
                alt="Logo"
                className="w-full h-full object-cover shrink-0 select-none"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-extrabold font-display tracking-tight text-slate-900 dark:text-slate-100 uppercase">
                  Autonomous Newsletter Deck
                </h1>
                <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800/40 font-semibold font-mono whitespace-nowrap">
                  v3.0 Secure
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">ORGANIZATIONAL DISPATCH NETWORK</p>
            </div>
          </div>

          <div className="flex lg:hidden items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-[10px] px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/40 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        {/* Navigation / Language Status Indicators / Theme selector */}
        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-3 w-full lg:w-auto">
          <div className="hidden md:flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/40 font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Live Pipeline Online
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 flex items-center gap-1">
            <span>Region:</span>
            <span className="font-bold text-slate-900 dark:text-slate-200">EN-Global (A1)</span>
          </div>

          {/* Control Switch Mode Tabs */}
          <div className="flex gap-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-3xs">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Control Panel</span>
              <span className="sm:hidden">Control</span>
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "code"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Python View</span>
              <span className="sm:hidden">Python</span>
            </button>
          </div>

          {/* Premium Theme Selector */}
          <div className="flex gap-0.5 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-3xs">
            <button
              onClick={() => setTheme("light")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                theme === "light"
                  ? "bg-white dark:bg-slate-700 text-amber-500 shadow-3xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Light Mode"
            >
              <Sun className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                theme === "dark"
                  ? "bg-white dark:bg-slate-700 text-indigo-500 dark:text-indigo-400 shadow-3xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Dark Mode"
            >
              <Moon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme("system")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                theme === "system"
                  ? "bg-white dark:bg-slate-700 text-[#1D63ED] dark:text-blue-400 shadow-3xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="System Default"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Structural workspace */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* 3. Hero Section & Configuration (Inspired by Split Cards) */}
        {activeTab === "dashboard" && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0 animate-fadeIn transition-colors duration-200">

            {/* Left Column: Visual Status representation */}
            <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/40 p-6 md:p-8 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div className="space-y-4">
                <span className="inline-flex bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider border border-blue-100 dark:border-blue-800/40">
                  Instrument Panel
                </span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Active Campaign Metrics</h3>

                {/* Clean inline data summary card list */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center bg-white dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-800/65 shadow-3xs">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Topic Focus:</span>
                    <strong className="text-xs text-slate-900 dark:text-slate-200 font-mono">{niche || "Custom Targeted"}</strong>
                  </div>
                  <div className="flex justify-between items-center bg-white dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-800/65 shadow-3xs">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Compiled:</span>
                    <strong className="text-sm text-slate-900 dark:text-slate-200">{stats.totalIssuesGenerated} issues</strong>
                  </div>
                  <div className="flex justify-between items-center bg-white dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-800/65 shadow-3xs">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Saved Snapshots:</span>
                    <strong className="text-sm text-slate-900 dark:text-slate-200">{historyList.length} items</strong>
                  </div>
                  <div className="flex justify-between items-center bg-white dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-800/65 shadow-3xs">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Latest Run Sync:</span>
                    <strong className="text-xs text-slate-900 dark:text-slate-200 font-mono font-bold text-[#1D63ED] dark:text-blue-400">
                      {stats.lastSyncTime === "Never"
                        ? "Never"
                        : new Date(stats.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      }
                    </strong>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200 dark:border-slate-800 text-[10px] space-y-1 text-slate-400 dark:text-slate-505 font-mono tracking-wide mt-4">
                <p>COCKPIT PLATFORM RUNNING SAFE • PORT: 3000</p>
                <div className="flex items-center gap-1">
                  <span>Current Mode:</span>
                  <span className={`font-bold ${apiKey || hasServerKey ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500 dark:text-amber-450"}`}>
                    {apiKey || hasServerKey ? "API (DIRECT BRAIN)" : "LOCAL SIMULATOR READY"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Mission Editorial Typography & Quick form configurations */}
            <div className="lg:col-span-7 p-6 md:p-8 flex flex-col justify-between space-y-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 leading-tight uppercase font-display select-none">
                  Automated Tech Journalism,<br />
                  <span className="text-[#1D63ED] dark:text-blue-400">Made Effortless</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mt-2 leading-relaxed font-sans">
                  Designate custom niches, input secure Gemini standard models API keys, and launch or archive multi-agent press workflows. Use full offline simulation or connect model endpoints instantaneously.
                </p>
              </div>

              {/* High density clean input cards inside split layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">
                    Google AI Studio API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasServerKey ? "Loaded from server variables ••••" : "Optional: Enter custom API key..."}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all shadow-sm"
                  />
                  <p className="text-[9.5px] text-slate-500 dark:text-slate-450">
                    {hasServerKey
                      ? "✓ Safe backend key connection available."
                      : "💡 Runs local simulations if API Key is empty."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">
                    Target Technical Niche Topic
                  </label>
                  <input
                    type="text"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    disabled={isGenerating}
                    placeholder="e.g. Edge AI & Distributed Compute"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all shadow-sm disabled:opacity-55"
                  />
                  <p className="text-[9.5px] text-slate-500 dark:text-slate-450">
                    Change campaign focus to customize technical prompts.
                  </p>
                </div>
              </div>

              {/* Centered Trigger action button */}
              <div className="pt-2">
                <button
                  onClick={runAgentPipeline}
                  disabled={isGenerating || !niche.trim()}
                  className={`w-full py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 border shadow-md cursor-pointer ${
                    isGenerating
                      ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                      : "bg-[#1D63ED] hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white border-[#1D63ED] dark:border-blue-600 shadow-blue-500/15 dark:shadow-blue-500/5 font-bold"
                  }`}
                >
                  <Sparkles className={`h-4.5 w-4.5 ${isGenerating ? "animate-spin text-slate-400" : "text-white"}`} />
                  {isGenerating ? "Processing Campaign Run..." : "WAKE UP MULTI-AGENT NEWSROOM"}
                </button>
              </div>

            </div>

          </section>
        )}

        {/* Real-time Workstation Grid */}
        {activeTab === "dashboard" ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* Left Sidebar presets & snapshot archives */}
            <aside className="lg:col-span-1 space-y-6">

              {/* Niche Presets segment */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs transition-colors duration-200">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <Sliders className="h-4 w-4 text-[#1D63ED] dark:text-blue-400" />
                  <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">Presets Library</h3>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {NICHE_PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePresetClick(p)}
                      disabled={isGenerating}
                      className={`text-left px-3.5 py-2.5 rounded-xl text-xs transition-all border ${
                        niche === p
                          ? "bg-blue-50/70 border-[#1D63ED] text-[#1D63ED] font-semibold dark:bg-blue-950/20 dark:border-blue-500 dark:text-blue-400"
                          : "bg-[#F8FAFC]/50 border-slate-100 text-slate-600 hover:text-slate-900 hover:border-slate-350 hover:bg-slate-50 dark:bg-slate-800/40 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-850"
                      } disabled:opacity-55 cursor-pointer`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Saved Snapshots Archives vault */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs transition-colors duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-[#1D63ED] dark:text-blue-400" />
                    <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">Snapshots Vault</h3>
                  </div>
                  {historyList.length > 0 && (
                    <span className="text-[9.5px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded font-mono font-medium">
                      {historyList.length} Saved
                    </span>
                  )}
                </div>

                {/* Search query input for local archives */}
                {historyList.length > 0 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search campaign snap..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#F8FAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-550 rounded-xl pl-9 pr-3 py-2 text-[11px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all shadow-inner"
                    />
                  </div>
                )}

                {/* Local Storage Archive List render */}
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {historyList.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 dark:text-slate-505 space-y-2">
                      <Archive className="h-7 w-7 mx-auto text-slate-300 dark:text-slate-700" />
                      <p className="text-[10.5px] leading-relaxed text-slate-400 dark:text-slate-500 max-w-[160px] mx-auto">
                        No drafts saved yet. Compile campaign dispatches.
                      </p>
                    </div>
                  ) : filteredHistory.length === 0 ? (
                    <p className="text-center text-[10px] text-slate-400 dark:text-slate-505 py-6">No matches found.</p>
                  ) : (
                    filteredHistory.map((item) => {
                      const isActive = selectedHistoryId === item.id;
                      const formattedTime = new Date(item.timestamp).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      });

                      return (
                        <div
                          key={item.id}
                          onClick={() => loadHistoryItem(item)}
                          className={`group relative p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5 ${
                            isActive
                              ? "bg-blue-50/55 border-blue-500/60 text-[#1D63ED] dark:bg-blue-950/20 dark:border-blue-500/50 dark:text-blue-400 shadow-xs"
                              : "bg-[#F8FAFC] border-slate-200/80 hover:bg-slate-50 text-slate-600 hover:text-slate-800 dark:bg-slate-800/30 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-bold text-[11px] truncate font-display max-w-[125px] text-slate-800 dark:text-slate-200" title={item.niche}>
                              {item.niche}
                            </span>
                            <button
                              onClick={(e) => deleteHistoryItem(item.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 hover:border-red-500/40 rounded transition-all cursor-pointer bg-white dark:bg-slate-850 border border-slate-100 dark:border-slate-700"
                              title="Delete snapshot"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                            <Calendar className="h-3 w-3" />
                            <span>{formattedTime}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </aside>

            {/* Right Workstation: Agent Operations & Draft outputs */}
            <main className="lg:col-span-3 space-y-6">

              {/* 4. Agent Operations Grid (Inspired by Structured Topic Cards) & Live logs view */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2.5">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-[#1D63ED] dark:text-blue-400" />
                    <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Multi-Agent Operations Center
                    </h3>
                  </div>
                  <div className="bg-blue-55 dark:bg-blue-950/30 text-[#1D63ED] dark:text-blue-400 px-3 py-1 border border-blue-100 dark:border-blue-900/40 rounded-full font-mono text-[10px] font-bold flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1D63ED] dark:bg-blue-500 animate-pulse" />
                    Orchestrator Channel Active
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                  {/* Card 1: Trend Scout Agent */}
                  <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between bg-white dark:bg-slate-900 min-h-[300px] ${
                    activeAgentIndex === 0
                      ? "border-[#1D63ED] dark:border-blue-500 shadow-md shadow-blue-500/5 ring-1 ring-[#1D63ED]/10 dark:ring-blue-500/10"
                      : "border-slate-200 dark:border-slate-800"
                  }`}>
                    <div>
                      {/* Clean badge & icon */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase font-mono tracking-wider">
                          Officer Alpha
                        </span>
                        <Search className="h-4.5 w-4.5 text-[#1D63ED] dark:text-blue-400" />
                      </div>

                      {/* Agent avatar profile block */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-11 w-11 rounded-full overflow-hidden bg-slate-150 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 shrink-0">
                          <img
                            src="/src/assets/images/trend_scout_agent_1781615884593.jpg"
                            alt="Scout AI"
                            className="w-full h-full object-cover shrink-0 select-none"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Scout-Alpha</h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Trend & Metrics Auditor</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-505 dark:text-slate-400 leading-relaxed mb-4">
                        Scrapes HackerNews global listings, GitHub activity logs, and technical developer discussion feeds.
                      </p>

                      {/* Filtered realtime logs represented as bullet checklists */}
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3.5">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">Live Logs Feed</p>
                        <div className="max-h-[140px] overflow-y-auto space-y-1.5">
                          {agentScoutLogs.length === 0 ? (
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 italic">Standby. Awaiting telemetry triggers...</p>
                          ) : (
                            agentScoutLogs.slice(-3).map((log, index) => (
                              <div key={index} className="text-[10.5px] text-slate-600 dark:text-slate-350 leading-normal pl-2 border-l-2 border-emerald-500/40 font-mono">
                                {log.message}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold ${activeAgentIndex === 0 ? "text-emerald-500" : "text-slate-400 dark:text-slate-500"}`}>
                        {activeAgentIndex === 0 ? "● LOGGING" : "✓ IDLE"}
                      </span>
                      <button
                        onClick={() => setActiveLogModal("scout")}
                        className="text-[11px] text-[#1D63ED] dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-350 font-bold tracking-tight cursor-pointer flex items-center gap-0.5"
                      >
                        View Full Logs →
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Synthesizer Writer Agent */}
                  <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between bg-white dark:bg-slate-900 min-h-[300px] ${
                    activeAgentIndex === 1
                      ? "border-[#1D63ED] dark:border-blue-500 shadow-md shadow-blue-500/5 ring-1 ring-[#1D63ED]/10 dark:ring-blue-500/10"
                      : "border-slate-200 dark:border-slate-800"
                  }`}>
                    <div>
                      {/* Clean badge & icon */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase font-mono tracking-wider">
                          Officer Beta
                        </span>
                        <Edit className="h-4.5 w-4.5 text-[#1D63ED] dark:text-blue-400" />
                      </div>

                      {/* Agent avatar profile block */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-11 w-11 rounded-full overflow-hidden bg-slate-150 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 shrink-0">
                          <img
                            src="/src/assets/images/writer_agent_1781615902469.jpg"
                            alt="Writer AI"
                            className="w-full h-full object-cover shrink-0 select-none cursor-default"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Writer-Beta</h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Primary Editorial Copydrafter</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-505 dark:text-slate-400 leading-relaxed mb-4">
                        Converts trend points into pristine structured prose, charts, markdown metrics, and code parameters.
                      </p>

                      {/* Filtered realtime logs */}
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3.5">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">Live Logs Feed</p>
                        <div className="max-h-[140px] overflow-y-auto space-y-1.5">
                          {agentWriterLogs.length === 0 ? (
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 italic">Standby. Awaiting payloads...</p>
                          ) : (
                            agentWriterLogs.slice(-3).map((log, index) => (
                              <div key={index} className="text-[10.5px] text-slate-600 dark:text-slate-350 leading-normal pl-2 border-l-2 border-blue-500/40 font-mono">
                                {log.message}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold ${activeAgentIndex === 1 ? "text-[#1D63ED] dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`}>
                        {activeAgentIndex === 1 ? "● GENERATING" : "✓ IDLE"}
                      </span>
                      <button
                        onClick={() => setActiveLogModal("writer")}
                        className="text-[11px] text-[#1D63ED] dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-350 font-bold tracking-tight cursor-pointer flex items-center gap-0.5"
                      >
                        View Full Logs →
                      </button>
                    </div>
                  </div>

                  {/* Card 3: Evaluator Critic Agent */}
                  <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between bg-white dark:bg-slate-900 min-h-[300px] ${
                    activeAgentIndex === 2
                      ? "border-[#1D63ED] dark:border-blue-500 shadow-md shadow-blue-500/5 ring-1 ring-[#1D63ED]/10 dark:ring-blue-500/10"
                      : "border-slate-200 dark:border-slate-800"
                  }`}>
                    <div>
                      {/* Clean badge & icon */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase font-mono tracking-wider">
                          Officer Gamma
                        </span>
                        <CheckCircle2 className="h-4.5 w-4.5 text-[#1D63ED] dark:text-blue-400" />
                      </div>

                      {/* Agent avatar profile */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-11 w-11 rounded-full overflow-hidden bg-slate-150 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 shrink-0 bg-gradient-to-tr from-amber-500/10 to-blue-500/10 flex items-center justify-center">
                          <Bot className="h-6 w-6 text-[#1D63ED] dark:text-blue-400" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Reviewer-Gamma</h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Compliance Critic</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-505 dark:text-slate-400 leading-relaxed mb-4">
                        Performs rule validation audits, checking margins, structuring markdown, and stamping verified releases.
                      </p>

                      {/* Filtered realtime logs */}
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3.5">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">Live Logs Feed</p>
                        <div className="max-h-[140px] overflow-y-auto space-y-1.5">
                          {agentEditorLogs.length === 0 ? (
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 italic">Standby. Ready to stamp compiled text...</p>
                          ) : (
                            agentEditorLogs.slice(-3).map((log, index) => (
                              <div key={index} className="text-[10.5px] text-slate-600 dark:text-slate-350 leading-normal pl-2 border-l-2 border-amber-500/40 font-mono">
                                {log.message}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold ${activeAgentIndex === 2 ? "text-amber-500 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                        {activeAgentIndex === 2 ? "● EVALUATING" : "✓ IDLE"}
                      </span>
                      <button
                        onClick={() => setActiveLogModal("editor")}
                        className="text-[11px] text-[#1D63ED] dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-350 font-bold tracking-tight cursor-pointer flex items-center gap-0.5"
                      >
                        View Full Logs →
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* 5. Functional Core Integration Display Output paper container */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col min-h-[480px] shadow-xs relative overflow-hidden transition-colors duration-200">

                {/* Switch view headers */}
                <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#1D63ED] dark:bg-blue-500" />
                    <span className="text-xs font-bold font-display uppercase tracking-wider text-slate-800 dark:text-slate-200 w-full">
                      Editorial Production Sheet
                    </span>
                  </div>

                  {newsletter && (
                    <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => setPreviewMode("preview")}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                          previewMode === "preview"
                            ? "bg-white dark:bg-slate-700 text-slate-950 dark:text-slate-50 border border-slate-200 dark:border-slate-600 shadow-3xs"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        <Eye className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                        Preview Draft
                      </button>
                      <button
                        onClick={() => setPreviewMode("raw")}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                          previewMode === "raw"
                            ? "bg-white dark:bg-slate-700 text-slate-950 dark:text-slate-50 border border-slate-200 dark:border-slate-600 shadow-3xs"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        <Edit className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                        Edit Markdown
                      </button>
                    </div>
                  )}
                </div>

                {/* Main draft text output sheet simulation rendering */}
                <div className="flex-1 overflow-y-auto bg-slate-50/20 dark:bg-slate-950/10 p-4 sm:p-6">
                  {!newsletter ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-20 space-y-3.5 animate-fadeIn">
                      <Archive className="h-10 w-10 text-slate-300 dark:text-slate-750" />
                      <div className="space-y-1">
                        <strong className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">
                          Publication Queue Empty
                        </strong>
                        <p className="text-xs max-w-xs text-slate-400 dark:text-slate-500 mx-auto leading-relaxed">
                          Awaiting multi-agent consensus run. Activate the trigger above or select a saved snapshot to display final content details.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {previewMode === "preview" ? (
                        /* Beautiful white editor paper simulation format sheet with top-brand line */
                        <div className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-xl p-6 sm:p-10 shadow-md border border-slate-205 dark:border-slate-800 select-text leading-relaxed font-serif animate-fadeIn mx-auto max-w-2xl relative min-h-[440px] transition-colors duration-200">

                          {/* Royal blue premium ribbon bar */}
                          <div className="absolute top-0 inset-x-0 h-1.5 bg-[#1D63ED]" />

                          {/* Corporate Heading Stamp plates */}
                          <div className="text-center pb-5 mb-6 border-b border-slate-300 dark:border-slate-800 font-sans">
                            <p className="text-[9px] font-extrabold tracking-widest text-[#1D63ED] dark:text-blue-400 uppercase font-mono mb-1">
                              Autonomous Corporate Intelligence Deck
                            </p>
                            <h2 className="text-xl font-black font-display tracking-tight text-slate-900 dark:text-slate-50 uppercase">
                              THE DISPATCH CHRONICLE
                            </h2>
                            <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 dark:text-slate-505 border-t border-dashed border-slate-200 dark:border-slate-850 pt-2 px-1 mt-3">
                              <span>PUB SNAP: #{selectedHistoryId ? selectedHistoryId.slice(-6) : "PENDING"}</span>
                              <span className="font-bold text-[#1D63ED] dark:text-blue-400 uppercase">COHORT: {niche}</span>
                              <span>STAMPED: 2026-EN</span>
                            </div>
                          </div>

                          {/* Render Parsed Blocks dynamically */}
                          <div className="space-y-5 text-sm font-serif text-slate-800 dark:text-slate-200 leading-relaxed font-normal selection:bg-blue-100 dark:selection:bg-blue-900/50">
                            {newsletter.split("\n\n").map((block, i) => {
                              if (block.startsWith("---")) {
                                return (
                                  <div key={i} className="border-y border-dashed border-slate-200 dark:border-slate-800 py-1.5 my-5 text-center font-sans font-semibold text-[9px] tracking-widest text-[#1D63ED] dark:text-blue-400 uppercase bg-slate-50 dark:bg-slate-900/40">
                                    Approved Segment Breakdown Block
                                  </div>
                                );
                              }
                              if (block.startsWith("# ")) {
                                return (
                                  <h1 key={i} className="text-lg font-black font-sans text-slate-900 dark:text-slate-50 tracking-tight mt-6 mb-2 border-b-2 border-slate-900 dark:border-slate-700 pb-2 uppercase text-center font-display">
                                    {block.replace("# ", "")}
                                  </h1>
                                );
                              }
                              if (block.startsWith("## ")) {
                                return (
                                  <h2 key={i} className="text-sm font-bold font-sans text-[#1D63ED] dark:text-blue-400 tracking-tight mt-6 pb-1 border-b border-slate-200 dark:border-slate-800 uppercase font-display">
                                    {block.replace("## ", "")}
                                  </h2>
                                );
                              }
                              if (block.startsWith("### ")) {
                                return (
                                  <h3 key={i} className="text-xs font-bold font-sans text-slate-900 dark:text-slate-50 mt-4 tracking-tight uppercase font-mono">
                                    {block.replace("### ", "")}
                                  </h3>
                                );
                              }
                              if (block.startsWith("- ") || block.startsWith("* ")) {
                                return (
                                  <ul key={i} className="list-disc pl-5 space-y-1.5 my-3 font-sans text-[11.5px] text-slate-700 dark:text-slate-300">
                                    {block.split("\n").map((li, idx) => (
                                      <li key={idx} className="leading-relaxed">{li.replace(/^[\s-*]+/, "")}</li>
                                    ))}
                                  </ul>
                                );
                              }
                              if (block.startsWith("```")) {
                                const lines = block.split("\n");
                                const codeBlock = lines.slice(1, -1).join("\n");
                                return (
                                  <pre key={i} className="bg-slate-50 dark:bg-slate-905 p-4 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[10px] text-slate-800 dark:text-slate-300 overflow-x-auto whitespace-pre my-4 shadow-3xs">
                                    <code>{codeBlock}</code>
                                  </pre>
                                );
                              }
                              return <p key={i} className="text-[12.5px] leading-relaxed tracking-normal font-serif text-slate-800 dark:text-slate-300 indent-4">{block}</p>;
                            })}
                          </div>

                          {/* Structured footer verification indicators */}
                          <div className="border-t border-slate-350 dark:border-slate-800 pt-5 mt-8 text-center text-[8.5px] tracking-widest text-slate-400 dark:text-slate-505 font-sans uppercase space-y-1">
                            <p>© 2026 PRISM EXECUTIVE SYNDICATE • DIGITAL PORTAL APPROVED</p>
                            <p className="text-[8px] text-[#1D63ED]/85 dark:text-blue-400 font-bold font-mono">CRYPTOGRAPHIC CLEARANCE ID CODE STAMP OK</p>
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={newsletter}
                          onChange={(e) => setNewsletter(e.target.value)}
                          className="w-full h-[500px] bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-mono text-[11.5px] border border-slate-200 dark:border-slate-800 rounded-xl p-4 select-text leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#1D63ED]/10 dark:focus:ring-blue-500/10 shadow-inner"
                        />
                      )}
                    </>
                  )}
                </div>

                {/* Action panel footer at the bottom of the document preview container */}
                {newsletter && (
                  <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-905 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 rounded-b-3xl">
                    <button
                      onClick={downloadMarkdown}
                      className="w-full sm:flex-1 bg-[#1D63ED] hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Download className="h-4 w-4" />
                      Download Markdown (.md)
                    </button>

                    <button
                      onClick={saveNewsletterChanges}
                      className={`w-full sm:w-auto px-4 py-3 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        saveSuccessMsg
                          ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <Save className="h-4 w-4" />
                      <span>{saveSuccessMsg || "Save Snapshot"}</span>
                    </button>

                    <button
                      onClick={() => copyToClipboard(newsletter, true)}
                      className="w-full sm:w-auto p-3 border border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Copy Markdown Clipboard"
                    >
                      {copiedMd ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                          <span className="sm:hidden text-xs font-bold text-emerald-600 dark:text-emerald-500">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span className="sm:hidden text-xs font-bold">Copy to Clipboard</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

              </div>

            </main>

          </div>
        ) : (
          /* Python Exporters code segment tab screen */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs relative transition-colors duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div>
                <h2 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-[#1D63ED] dark:text-blue-400" />
                  Off-Grid Streamlit Python Dashboard Code
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Download or copy the full system-wide multi-agent pipeline script to trigger technical dispatches locally on your device.
                </p>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => copyToClipboard(pythonStreamlitCode, false)}
                  className="bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 text-slate-705 dark:text-slate-300 font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                >
                  {copiedCode ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                      Copied Code
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-slate-500" />
                      Copy Code
                    </>
                  )}
                </button>
                <button
                  onClick={downloadPythonScript}
                  className="bg-[#1D63ED] hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-md shadow-blue-500/10 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  Download app.py
                </button>
              </div>
            </div>

            {/* Structured step by step tutorial guide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-slate-600 dark:text-slate-300">
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 flex items-center justify-center bg-blue-50 dark:bg-blue-950/40 text-[#1D63ED] dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 font-bold rounded-lg text-[10px]">
                    1
                  </span>
                  <strong className="text-slate-800 dark:text-slate-200">Install Prerequisites</strong>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-450 leading-relaxed font-mono">
                  Install requirement dependencies using standard pip command line:
                </p>
                <code className="block bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-80 border-slate-200 dark:border-slate-800 rounded-lg text-[10px] text-[#1D63ED] dark:text-blue-400 select-all font-mono shadow-inner">
                  pip install streamlit google-generativeai
                </code>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 flex items-center justify-center bg-blue-50 dark:bg-blue-950/40 text-[#1D63ED] dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 font-bold rounded-lg text-[10px]">
                    2
                  </span>
                  <strong className="text-slate-800 dark:text-slate-200">Save Local File</strong>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-450 leading-relaxed font-mono">
                  Create a file on your local machine and paste the copied Python template script code:
                </p>
                <code className="block bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-80 border-slate-200 dark:border-slate-800 rounded-lg text-[10px] text-[#1D63ED] dark:text-blue-400 font-mono shadow-xs">
                  app.py
                </code>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 flex items-center justify-center bg-blue-50 dark:bg-blue-950/40 text-[#1D63ED] dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 font-bold rounded-lg text-[10px]">
                    3
                  </span>
                  <strong className="text-slate-800 dark:text-slate-200">Execute Server Command</strong>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-450 leading-relaxed font-mono">
                  Boot the high fidelity Streamlit server interface locally:
                </p>
                <code className="block bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-80 border-slate-200 dark:border-slate-800 rounded-lg text-[10px] text-[#1D63ED] dark:text-blue-400 select-all font-mono shadow-inner">
                  streamlit run app.py
                </code>
              </div>
            </div>

            {/* Pure view code text box panel */}
            <div className="relative font-mono">
              <pre className="bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto text-[11px] leading-relaxed text-slate-600 dark:text-slate-405 max-h-[480px] shadow-inner select-text scrollbar-thin">
                <code className="select-text">{pythonStreamlitCode}</code>
              </pre>
            </div>
          </div>
        )}

      </div>

      {/* 4. Active Log Modals for precise agent operations timeline stream */}
      {activeLogModal && (
        <div className="fixed inset-0 bg-slate-950/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-850 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[80vh] transition-colors duration-200">

            {/* Modal Title bar */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 dark:bg-blue-955 rounded-lg text-[#1D63ED] dark:text-blue-400 font-bold">●</span>
                <h4 className="text-xs font-bold text-slate-950 dark:text-slate-200 uppercase tracking-wider font-mono">
                  {activeLogModal === "scout" && "Scout-Alpha Telemetry Timeline"}
                  {activeLogModal === "writer" && "Writer-Beta Text-predict Timeline"}
                  {activeLogModal === "editor" && "Reviewer-Gamma Compliance Audit"}
                </h4>
              </div>
              <button
                onClick={() => setActiveLogModal(null)}
                className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal logs content list */}
            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs text-slate-700 dark:text-slate-300 flex-1">
              {activeLogModal === "scout" && (
                agentScoutLogs.length === 0 ? (
                  <p className="text-slate-400 dark:text-slate-505 italic text-center py-8">No Scout-Alpha telemetry captured yet. Run a session above to load.</p>
                ) : (
                  agentScoutLogs.map((log, index) => (
                    <div key={index} className="border-l-2 border-emerald-500/40 pl-3.5 py-1.5">
                      <span className="text-[9.5px] text-slate-400 dark:text-slate-505 block mb-0.5">[{log.timestamp}] [ALPHA-SCOUT]</span>
                      <p className="text-[11px] text-slate-800 dark:text-slate-200">{log.message}</p>
                    </div>
                  ))
                )
              )}

              {activeLogModal === "writer" && (
                agentWriterLogs.length === 0 ? (
                  <p className="text-slate-400 dark:text-slate-550 italic text-center py-8">No Writer-Beta parameters compiled yet.</p>
                ) : (
                  agentWriterLogs.map((log, index) => (
                    <div key={index} className="border-l-2 border-blue-500/40 pl-3.5 py-1.5">
                      <span className="text-[9.5px] text-slate-400 dark:text-slate-555 block mb-0.5">[{log.timestamp}] [BETA-WRITER]</span>
                      <p className="text-[11px] text-slate-800 dark:text-slate-200">{log.message}</p>
                    </div>
                  ))
                )
              )}

              {activeLogModal === "editor" && (
                agentEditorLogs.length === 0 ? (
                  <p className="text-slate-400 dark:text-slate-550 italic text-center py-8">No Reviewer-Gamma compliance stamps captured yet.</p>
                ) : (
                  agentEditorLogs.map((log, index) => (
                    <div key={index} className="border-l-2 border-amber-500/40 pl-3.5 py-1.5">
                      <span className="text-[9.5px] text-slate-400 dark:text-slate-555 block mb-0.5">[{log.timestamp}] [EVALUATOR]</span>
                      <p className="text-[11px] text-slate-800 dark:text-slate-200">{log.message}</p>
                    </div>
                  ))
                )
              )}
            </div>

            {/* Modal close footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950 flex justify-end">
              <button
                onClick={() => setActiveLogModal(null)}
                className="bg-[#1D63ED] hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer shadow-3xs"
              >
                Close Telemetry View
              </button>
            </div>

          </div>
        </div>
      )}

      {/* General Alert / Error Display */}
      {errorMsg && (
        <div className="fixed bottom-6 right-6 max-w-sm bg-red-50 dark:bg-red-950/30 border border-red-250 dark:border-red-900/60 p-4 rounded-2xl shadow-xl text-xs z-50 animate-bounce flex gap-2.5">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <strong className="text-slate-900 dark:text-slate-100 block font-bold leading-none mb-1">System Pipeline Exception</strong>
            <p className="text-slate-600 dark:text-slate-350 leading-relaxed text-[10px]">{errorMsg}</p>
            <button
              onClick={() => setErrorMsg("")}
              className="text-[10px] text-[#1D63ED] dark:text-blue-400 font-bold mt-1.5 underline cursor-pointer"
            >
              Acknowledge Block
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
