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
  Monitor,
  Activity,
  Send
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
  topic?: string;
  model?: string;
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
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [ollamaHost, setOllamaHost] = useState("http://localhost:11434");
  const [niche, setNiche] = useState("AI & Agentic Frameworks");
  const [topic, setTopic] = useState("");
  const [modelName, setModelName] = useState("gemini-2.5-flash");

  // Load from localStorage
  useEffect(() => {
    setApiKey(localStorage.getItem("newsroom_gemini_api_key") || "");
    setOpenaiApiKey(localStorage.getItem("newsroom_openai_api_key") || "");
    setAnthropicApiKey(localStorage.getItem("newsroom_anthropic_api_key") || "");
    setGroqApiKey(localStorage.getItem("newsroom_groq_api_key") || "");
    setOllamaHost(localStorage.getItem("newsroom_ollama_host") || "http://localhost:11434");
  }, []);

  const updateApiKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem("newsroom_gemini_api_key", val);
  };
  const updateOpenaiApiKey = (val: string) => {
    setOpenaiApiKey(val);
    localStorage.setItem("newsroom_openai_api_key", val);
  };
  const updateAnthropicApiKey = (val: string) => {
    setAnthropicApiKey(val);
    localStorage.setItem("newsroom_anthropic_api_key", val);
  };
  const updateGroqApiKey = (val: string) => {
    setGroqApiKey(val);
    localStorage.setItem("newsroom_groq_api_key", val);
  };
  const updateOllamaHost = (val: string) => {
    setOllamaHost(val);
    localStorage.setItem("newsroom_ollama_host", val);
  };

  // Dashboard state
  const [stats, setStats] = useState<BackendStats>({
    totalIssuesGenerated: 0,
    lastSyncTime: "Never",
    activeAgents: ["Trend Scout Agent", "Writer Agent", "Evaluator Agent"]
  });
  const [hasServerKey, setHasServerKey] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "code">("dashboard");

  // Streamlit Dashboard Merged States
  const [activeSubTab, setActiveSubTab] = useState<"workspace" | "cooperation" | "logs" | "archive" | "analytics" | "observability" | "publisher_outbox">("workspace");
  const [selectedObsRunId, setSelectedObsRunId] = useState<number | null>(null);
  const [serverHistory, setServerHistory] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [workerStatus, setWorkerStatus] = useState<any>(null);
  const [serverDrafts, setServerDrafts] = useState<string[]>([]);
  const [selectedDraftName, setSelectedDraftName] = useState<string>("");
  const [selectedDraftContent, setSelectedDraftContent] = useState<string>("");

  const [pubConfig, setPubConfig] = useState({
    dry_run: true,
    wordpress: { enabled: false, url: "", username: "", password_env_var: "WP_APPLICATION_PASSWORD" },
    webhook: { enabled: false, url: "" }
  });
  const [outboxPayloads, setOutboxPayloads] = useState<any>({ wordpress: null, webhook: null });

  const fetchPublishingConfig = async () => {
    try {
      const res = await fetch("/api/publishing-config");
      if (res.ok) {
        const data = await res.json();
        setPubConfig(data);
      }
    } catch (e) {
      console.error("Error fetching publishing config:", e);
    }
  };

  const savePublishingConfig = async (newConfig: typeof pubConfig) => {
    try {
      const res = await fetch("/api/publishing-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        setPubConfig(newConfig);
      }
    } catch (e) {
      console.error("Error saving publishing config:", e);
    }
  };

  const fetchOutboxPayloads = async () => {
    try {
      const res = await fetch("/api/publisher-outbox");
      if (res.ok) {
        const data = await res.json();
        setOutboxPayloads(data);
      }
    } catch (e) {
      console.error("Error fetching outbox payloads:", e);
    }
  };

  const [isDispatching, setIsDispatching] = useState<Record<"wordpress" | "webhook", boolean>>({ wordpress: false, webhook: false });

  const dispatchOutboxPayload = async (target: "wordpress" | "webhook") => {
    setIsDispatching(prev => ({ ...prev, [target]: true }));
    try {
      const res = await fetch("/api/publish-outbox-payload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${data.message || "Successfully published!"}`);
      } else {
        alert(`❌ Error publishing: ${data.error || "Failed to publish."}`);
      }
    } catch (e: any) {
      alert(`❌ Connection error: ${e.message}`);
    } finally {
      setIsDispatching(prev => ({ ...prev, [target]: false }));
    }
  };

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

  // Streamlit Dashboard Telemetry Fetchers
  const fetchDashboardTelemetry = async (autoLoadLatestDraft = false) => {
    try {
      const historyRes = await fetch("/api/history");
      const historyData = await historyRes.json();
      setServerHistory(historyData);

      const interactionsRes = await fetch("/api/interactions");
      const interactionsData = await interactionsRes.json();
      setInteractions(interactionsData);

      const workerRes = await fetch("/api/worker-status");
      const workerData = await workerRes.json();
      setWorkerStatus(workerData);

      const draftsRes = await fetch("/api/drafts");
      const draftsData = await draftsRes.json();
      setServerDrafts(draftsData);
      if (draftsData.length > 0 && !selectedDraftName) {
        setSelectedDraftName(draftsData[0]);
      }

      // Auto-load the latest server draft into the editorial sheet on initial mount
      if (autoLoadLatestDraft && draftsData.length > 0) {
        try {
          const latestDraftRes = await fetch(`/api/drafts/${encodeURIComponent(draftsData[0])}`);
          if (latestDraftRes.ok) {
            const latestContent = await latestDraftRes.text();
            setNewsletter((prev) => prev || latestContent);
          }
        } catch (draftErr) {
          console.error("Error auto-loading latest draft:", draftErr);
        }
      }

      // Seed Snapshots Vault with server history if local history is empty
      if (historyData.length > 0) {
        setHistoryList((prev) => {
          if (prev.length > 0) return prev;
          const serverItems: SavedNewsletter[] = historyData.slice(0, 10).map((run: any, idx: number) => ({
            id: `server_${idx}_${Date.now()}`,
            niche: run.niche || "Unknown",
            timestamp: run.timestamp || new Date().toISOString(),
            content: "",
            logs: (run.agent_a?.headlines_pulled || []).map((h: string) => ({
              agent: "Trend Scout",
              message: `Pulled: ${h}`,
              timestamp: run.timestamp || "",
            })),
            topic: run.topic,
            model: run.model || "gemini-2.5-flash",
          }));
          return serverItems;
        });
      }
    } catch (err) {
      console.error("Error fetching dashboard telemetry:", err);
    }
  };

  const fetchDraftContent = async (name: string) => {
    if (!name) return;
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(name)}`);
      if (res.ok) {
        const text = await res.text();
        setSelectedDraftContent(text);
      }
    } catch (err) {
      console.error("Error fetching draft content:", err);
    }
  };

  useEffect(() => {
    fetchDraftContent(selectedDraftName);
  }, [selectedDraftName]);

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
    fetchDashboardTelemetry(true);
    fetchPublishingConfig();
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
          customApiKey: apiKey.trim() || undefined,
          customGeminiApiKey: apiKey.trim() || undefined,
          customOpenAIApiKey: openaiApiKey.trim() || undefined,
          customAnthropicApiKey: anthropicApiKey.trim() || undefined,
          customGroqApiKey: groqApiKey.trim() || undefined,
          customOllamaHost: ollamaHost.trim() || undefined,
          topic: topic.trim() || undefined,
          model: modelName
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
          fetchDashboardTelemetry();

          // Save completed pipeline run into browser local history
          if (draftText) {
            const newRecord: SavedNewsletter = {
              id: Date.now().toString(),
              niche: niche,
              topic: topic.trim() || undefined,
              model: modelName,
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
  const loadHistoryItem = async (item: SavedNewsletter) => {
    if (isGenerating) return;
    setSelectedHistoryId(item.id);
    setNiche(item.niche);
    setTopic(item.topic || "");
    setModelName(item.model || "gemini-2.5-flash");

    // If this is a server-seeded item with empty content, try to load matching draft from server
    if (!item.content && serverDrafts.length > 0) {
      const nicheSlug = item.niche.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const matchingDraft = serverDrafts.find(d => d.includes(nicheSlug));
      if (matchingDraft) {
        try {
          const res = await fetch(`/api/drafts/${encodeURIComponent(matchingDraft)}`);
          if (res.ok) {
            const content = await res.text();
            setNewsletter(content);
          }
        } catch (_) {}
      }
    } else {
      setNewsletter(item.content);
    }

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

  const getProviderFromModel = (model: string) => {
    const m = model.toLowerCase();
    if (m.startsWith("gemini-")) return "gemini";
    if (m.startsWith("gpt-")) return "openai";
    if (m.startsWith("claude-")) return "anthropic";
    if (m.startsWith("ollama-")) return "ollama";
    if (m.includes("llama-3") || m.includes("mixtral") || m.includes("gemma2")) return "groq";
    return "gemini";
  };

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
  // Compute analytics metrics from server telemetry
  const totalRuns = serverHistory.length;
  const successRuns = serverHistory.filter((r) => r.status === "success").length;
  const totalTokens = serverHistory.reduce((acc, r) => acc + (r.agent_b?.total_tokens || 0), 0);
  const avgQualityScore = totalRuns > 0 ? Math.round(serverHistory.reduce((acc, r) => acc + (r.agent_c?.score || 0), 0) / totalRuns) : 0;
  const complianceRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 100;

  let lastWakeStr = "Never";
  let lastWakeAgo = "No runs yet";
  if (serverHistory.length > 0) {
    const lastRun = serverHistory[serverHistory.length - 1];
    if (lastRun.timestamp) {
      const lastDt = new Date(lastRun.timestamp);
      lastWakeStr = lastDt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + lastDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const diffMin = Math.floor((Date.now() - lastDt.getTime()) / 60000);
      lastWakeAgo = diffMin < 60 ? `${diffMin}m ago` : `${Math.floor(diffMin / 60)}h ago`;
    }
  }

  // Filter out logs per agent for structured grid checklists
  const agentScoutLogs = visibleLogs.filter(log => log.agent === "Trend Scout");
  const agentWriterLogs = visibleLogs.filter(log => log.agent === "Writer");
  const agentEditorLogs = visibleLogs.filter(log => log.agent === "Evaluator" || log.agent === "System");

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans selection:bg-blue-500/10 dark:selection:bg-blue-600/20 selection:text-blue-700 dark:selection:text-blue-400 transition-colors duration-200 relative overflow-hidden tech-grid-bg">

      {/* Ambient glassmorphic glowing design blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-400/10 dark:bg-blue-600/5 blur-[100px] pointer-events-none animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-400/10 dark:bg-indigo-600/5 blur-[100px] pointer-events-none animate-float" style={{ animationDelay: "-3s" }} />

      {/* 2. Professional Header (Navigation Bar Simulation) */}
      <header className="border-b border-slate-200/50 dark:border-slate-800/40 glass-effect sticky top-0 z-40 px-4 sm:px-6 py-3.5 flex flex-col lg:flex-row justify-between items-center gap-4 shadow-sm transition-all duration-300">
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl overflow-hidden shadow-md shrink-0 border border-slate-100 dark:border-slate-800 bg-[#1D63ED] hover:scale-105 transition-transform duration-300">
              <img
                src="/src/assets/images/newsletter_logo_1781618675903.jpg"
                alt="Logo"
                className="w-full h-full object-cover shrink-0 select-none"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-extrabold font-display tracking-tight text-slate-900 dark:text-slate-50 uppercase">
                  Autonomous Newsletter Deck
                </h1>
                <span className="text-[10px] bg-blue-50 dark:bg-blue-900/35 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-100/80 dark:border-blue-800/40 font-bold font-mono whitespace-nowrap">
                  v3.0 Secure
                </span>
              </div>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold tracking-widest uppercase font-mono">ORGANIZATIONAL DISPATCH NETWORK</p>
            </div>
          </div>

          <div className="flex lg:hidden items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 text-[10px] px-2.5 py-1 rounded-full border border-emerald-250 dark:border-emerald-900/30 font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        {/* Navigation / Language Status Indicators / Theme selector */}
        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-3 w-full lg:w-auto">
          <div className="hidden md:flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-700 dark:text-emerald-400 text-xs px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/30 font-bold shadow-3xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Live Pipeline Online
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-450 bg-white/50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 rounded-xl px-2.5 py-1 flex items-center gap-1">
            <span>Region:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">EN-Global (A1)</span>
          </div>

          {/* Control Switch Mode Tabs */}
          <div className="flex gap-1 bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/60 shadow-3xs">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-[#1D63ED] text-white shadow-sm shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Control Panel</span>
              <span className="sm:hidden">Control</span>
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                activeTab === "code"
                  ? "bg-[#1D63ED] text-white shadow-sm shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Python View</span>
              <span className="sm:hidden">Python</span>
            </button>
          </div>

          {/* Premium Theme Selector */}
          <div className="flex gap-0.5 bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/60 shadow-3xs">
            <button
              onClick={() => setTheme("light")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                theme === "light"
                  ? "bg-white dark:bg-slate-700 text-amber-500 shadow-3xs"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
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
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
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
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
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

        {/* 4. Streamlit Merged Metrics Cards */}
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
            {/* Card 1: Last Wake */}
            <div className="relative overflow-hidden group card-bg-scout border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-5 shadow-md flex flex-col justify-between min-h-[112px] hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300">
              <div className="absolute top-0 right-0 p-3.5 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-300">
                <Clock className="h-10 w-10 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">Agent A Last Wake</span>
              </div>
              <h3 className="text-xl font-bold font-sans mt-2 tracking-tight text-slate-900 dark:text-slate-100">{lastWakeStr}</h3>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-600 dark:bg-slate-400" />
                {lastWakeAgo}
              </span>
            </div>

            {/* Card 2: Fleet Cycles */}
            <div className="relative overflow-hidden group card-bg-writer border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-5 shadow-md flex flex-col justify-between min-h-[112px] hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all duration-300">
              <div className="absolute top-0 right-0 p-3.5 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-300">
                <Cpu className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">Total Fleet Cycles</span>
              </div>
              <h3 className="text-xl font-bold font-sans mt-2 tracking-tight text-slate-900 dark:text-slate-100">{totalRuns}</h3>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-1 flex items-center gap-1">
                <span className="h-1 w-1 bg-emerald-500 rounded-full inline-block" />
                {successRuns} successful runs
              </span>
            </div>

            {/* Card 3: Total Tokens */}
            <div className="relative overflow-hidden group card-bg-hero border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-5 shadow-md flex flex-col justify-between min-h-[112px] hover:border-purple-500/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] transition-all duration-300">
              <div className="absolute top-0 right-0 p-3.5 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-300">
                <TrendingUp className="h-10 w-10 text-purple-500 dark:text-purple-400" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">Total Tokens Used</span>
              </div>
              <h3 className="text-xl font-bold font-sans mt-2 tracking-tight text-slate-900 dark:text-slate-100">{totalTokens.toLocaleString()}</h3>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono mt-1">across all agent runs</span>
            </div>

            {/* Card 4: Avg Quality Score */}
            <div className="relative overflow-hidden group card-bg-logo border border-slate-200/80 dark:border-slate-800/60 rounded-2xl p-5 shadow-md flex flex-col justify-between min-h-[112px] hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] transition-all duration-300">
              <div className="absolute top-0 right-0 p-3.5 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-300">
                <Sparkles className="h-10 w-10 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">Avg Quality Score</span>
              </div>
              <h3 className="text-xl font-bold font-sans mt-2 tracking-tight text-slate-900 dark:text-slate-100">{avgQualityScore}/100</h3>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono mt-1">{complianceRate}% compliance rate</span>
            </div>
          </div>
        )}

        {/* 3. Hero Section & Configuration (Inspired by Split Cards) */}
        {activeTab === "dashboard" && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/70 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0 animate-fadeIn transition-all duration-300 glass-effect">

            {/* Left Column: Visual Status representation */}
            <div className="lg:col-span-5 bg-slate-50/50 dark:bg-slate-900/20 p-6 md:p-8 border-b lg:border-b-0 lg:border-r border-slate-200/60 dark:border-slate-800/60 flex flex-col justify-between">
              <div className="space-y-4">
                <span className="inline-flex bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider border border-blue-100 dark:border-blue-800/40">
                  Instrument Panel
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight font-display">Active Campaign Metrics</h3>

                {/* Clean inline data summary card list */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex justify-between items-center bg-white/70 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-3xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Topic Focus:</span>
                    <strong className="text-xs text-slate-850 dark:text-slate-200 font-mono">{niche || "Custom Targeted"}</strong>
                  </div>
                  <div className="flex justify-between items-center bg-white/70 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-3xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Compiled:</span>
                    <strong className="text-sm text-slate-850 dark:text-slate-200">{stats.totalIssuesGenerated} issues</strong>
                  </div>
                  <div className="flex justify-between items-center bg-white/70 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-3xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Saved Snapshots:</span>
                    <strong className="text-sm text-slate-850 dark:text-slate-200">{historyList.length} items</strong>
                  </div>
                  <div className="flex justify-between items-center bg-white/70 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-3xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Latest Run Sync:</span>
                    <strong className="text-xs text-slate-850 dark:text-slate-200 font-mono font-bold text-[#1D63ED] dark:text-blue-400">
                      {stats.lastSyncTime === "Never"
                        ? "Never"
                        : new Date(stats.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      }
                    </strong>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200/60 dark:border-slate-800/60 text-[9.5px] space-y-1 text-slate-400 dark:text-slate-500 font-mono tracking-wider mt-4">
                <p>COCKPIT PLATFORM RUNNING SAFE • PORT: 3000</p>
                <div className="flex items-center gap-1">
                  <span>Current Mode:</span>
                  <span className={`font-bold ${apiKey || hasServerKey ? "text-emerald-500 dark:text-emerald-450" : "text-amber-500 dark:text-amber-450"}`}>
                    {apiKey || hasServerKey ? "API (DIRECT BRAIN)" : "LOCAL SIMULATOR READY"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Mission Editorial Typography & Quick form configurations */}
            <div className="lg:col-span-7 p-6 md:p-8 flex flex-col justify-between space-y-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-50 leading-tight uppercase font-display select-none">
                  Automated Tech Journalism,<br />
                  <span className="text-[#1D63ED] dark:text-blue-400">Made Effortless</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mt-2 leading-relaxed font-sans">
                  Designate custom niches, input secure Gemini standard models API keys, and launch or archive multi-agent press workflows. Use full offline simulation or connect model endpoints instantaneously.
                </p>
              </div>
              {/* High density clean input cards inside split layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {getProviderFromModel(modelName) === "gemini" && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">
                      Google AI Studio API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => updateApiKey(e.target.value)}
                      placeholder={hasServerKey ? "Loaded from server variables ••••" : "Optional: Enter Gemini API key..."}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-550 focus:outline-none transition-all shadow-3xs"
                    />
                    <p className="text-[9.5px] text-slate-450 dark:text-slate-500">
                      {hasServerKey
                        ? "✓ Safe backend key connection available."
                        : "💡 Runs local simulations if API Key is empty."}
                    </p>
                  </div>
                )}

                {getProviderFromModel(modelName) === "openai" && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">
                      OpenAI API Key
                    </label>
                    <input
                      type="password"
                      value={openaiApiKey}
                      onChange={(e) => updateOpenaiApiKey(e.target.value)}
                      placeholder="Enter OpenAI API key (sk-...)"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-550 focus:outline-none transition-all shadow-3xs"
                    />
                    <p className="text-[9.5px] text-slate-450 dark:text-slate-500">
                      💡 Uses simulation mode if API Key is empty.
                    </p>
                  </div>
                )}

                {getProviderFromModel(modelName) === "anthropic" && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">
                      Anthropic Claude API Key
                    </label>
                    <input
                      type="password"
                      value={anthropicApiKey}
                      onChange={(e) => updateAnthropicApiKey(e.target.value)}
                      placeholder="Enter Anthropic API key (sk-ant-...)"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-550 focus:outline-none transition-all shadow-3xs"
                    />
                    <p className="text-[9.5px] text-slate-450 dark:text-slate-500">
                      💡 Uses simulation mode if API Key is empty.
                    </p>
                  </div>
                )}

                {getProviderFromModel(modelName) === "groq" && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">
                      Groq Cloud API Key
                    </label>
                    <input
                      type="password"
                      value={groqApiKey}
                      onChange={(e) => updateGroqApiKey(e.target.value)}
                      placeholder="Enter Groq API key (gsk-...)"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-550 focus:outline-none transition-all shadow-3xs"
                    />
                    <p className="text-[9.5px] text-slate-450 dark:text-slate-500">
                      💡 Uses simulation mode if API Key is empty.
                    </p>
                  </div>
                )}

                {getProviderFromModel(modelName) === "ollama" && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">
                      Ollama Host Endpoint
                    </label>
                    <input
                      type="text"
                      value={ollamaHost}
                      onChange={(e) => updateOllamaHost(e.target.value)}
                      placeholder="e.g. http://localhost:11434"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-550 focus:outline-none transition-all shadow-3xs"
                    />
                    <p className="text-[9.5px] text-slate-450 dark:text-slate-500">
                      💡 Assumes a local Ollama instance running.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-455 uppercase tracking-wider font-mono">
                    Target Technical Niche Topic
                  </label>
                  <input
                    type="text"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    disabled={isGenerating}
                    placeholder="e.g. Edge AI & Distributed Compute"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-550 focus:outline-none transition-all shadow-3xs disabled:opacity-55"
                  />
                  <p className="text-[9.5px] text-slate-455 dark:text-slate-500 font-mono">
                    Change campaign focus to customize technical prompts.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-455 uppercase tracking-wider font-mono">
                    Custom Subject Topic (Optional)
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={isGenerating}
                    placeholder="e.g. Model-Context Protocol (MCP) details"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-555 focus:outline-none transition-all shadow-3xs disabled:opacity-55"
                  />
                  <p className="text-[9.5px] text-slate-455 dark:text-slate-500 font-mono">
                    Bypasses standard feeds for targeted deep-dive research.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10.5px] font-bold text-slate-500 dark:text-slate-455 uppercase tracking-wider font-mono">
                    Selected LLM Router Endpoint
                  </label>
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    disabled={isGenerating}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-[#1D63ED] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#1D63ED]/15 dark:focus:ring-blue-500/15 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none transition-all shadow-3xs disabled:opacity-55 font-mono cursor-pointer"
                  >
                    <optgroup label="Google Gemini">
                      <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                      <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                      <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                    </optgroup>
                    <optgroup label="OpenAI">
                      <option value="gpt-4o">gpt-4o</option>
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                      <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                    </optgroup>
                    <optgroup label="Anthropic">
                      <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                      <option value="claude-3-opus">claude-3-opus</option>
                      <option value="claude-3-5-haiku">claude-3-5-haiku</option>
                    </optgroup>
                    <optgroup label="Groq Cloud">
                      <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                      <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                      <option value="gemma2-9b-it">gemma2-9b-it</option>
                    </optgroup>
                    <optgroup label="Ollama (Local)">
                      <option value="ollama-llama3">ollama-llama3</option>
                      <option value="ollama-mistral">ollama-mistral</option>
                      <option value="ollama-phi3">ollama-phi3</option>
                    </optgroup>
                  </select>
                  <p className="text-[9.5px] text-slate-455 dark:text-slate-500 font-mono">
                    Routing selects best provider available.
                  </p>
                </div>
              </div>

              {/* Centered Trigger action button */}
              <div className="pt-2">
                <button
                  onClick={runAgentPipeline}
                  disabled={isGenerating || !niche.trim()}
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 border shadow-md cursor-pointer ${
                    isGenerating
                      ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-700 hover:to-indigo-700 text-white border-blue-550 dark:border-blue-600 shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99] relative overflow-hidden group font-display"
                  }`}
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <Sparkles className={`h-4.5 w-4.5 ${isGenerating ? "animate-spin text-slate-400" : "text-white animate-pulse"}`} />
                  <span>{isGenerating ? "Processing Campaign Run..." : "WAKE UP MULTI-AGENT NEWSROOM"}</span>
                </button>
              </div>

            </div>

          </section>
        )}

        {/* Streamlit Merged Sub-Tabs Menu */}
        {activeTab === "dashboard" && (
          <div className="flex flex-wrap gap-1 bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-3xs animate-fadeIn">
            <button
              onClick={() => setActiveSubTab("workspace")}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "workspace"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <Bot className="h-4 w-4" />
              <span>💻 Active Workstation</span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab("cooperation");
                fetchDashboardTelemetry();
              }}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "cooperation"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>💬 Live Agent Cooperation</span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab("logs");
                fetchDashboardTelemetry();
              }}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "logs"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <History className="h-4 w-4" />
              <span>📋 Fleet Transaction Logs</span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab("archive");
                fetchDashboardTelemetry();
              }}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "archive"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <Archive className="h-4 w-4" />
              <span>📰 Server Archive</span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab("analytics");
                fetchDashboardTelemetry();
              }}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "analytics"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span>📈 Metrics & Analytics</span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab("observability");
                fetchDashboardTelemetry();
              }}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "observability"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>🔍 Observability Traces</span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab("publisher_outbox");
                fetchOutboxPayloads();
              }}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "publisher_outbox"
                  ? "bg-[#1D63ED] text-white shadow-md shadow-blue-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <Send className="h-4 w-4" />
              <span>📡 Publisher Outbox</span>
            </button>
          </div>
        )}

        {/* Real-time Workstation Grid */}
        {activeTab === "dashboard" ? (
          activeSubTab === "workspace" ? (
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
                  <div className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between bg-white dark:bg-slate-900 min-h-[300px] glow-card ${
                    activeAgentIndex === 0
                      ? "border-purple-500/70 dark:border-purple-500/50 shadow-[0_0_25px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/10 dark:ring-purple-500/20"
                      : "border-slate-200 dark:border-slate-800"
                  }`}>
                    <div>
                      {/* Clean badge & icon */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase font-mono tracking-wider">
                          Officer Alpha
                        </span>
                        <Search className="h-4.5 w-4.5 text-purple-500" />
                      </div>

                      {/* Agent avatar profile block */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`h-11 w-11 rounded-full overflow-hidden bg-slate-150 dark:bg-slate-800 border shrink-0 transition-all duration-300 ${
                          activeAgentIndex === 0
                            ? "border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.4)] scale-105"
                            : "border-slate-250 dark:border-slate-700"
                        }`}>
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

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                        Scrapes HackerNews global listings, GitHub activity logs, and technical developer discussion feeds.
                      </p>

                      {/* Filtered realtime logs represented as bullet checklists */}
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-3.5">
                        <p className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">Live Logs Feed</p>
                        <div className="max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin">
                          {agentScoutLogs.length === 0 ? (
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 italic">Standby. Awaiting HN metrics feed...</p>
                          ) : (
                            agentScoutLogs.slice(-3).map((log, index) => (
                              <div key={index} className="text-[10px] text-slate-600 dark:text-slate-350 leading-normal pl-2.5 border-l-2 border-purple-500/40 font-mono">
                                {log.message}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold flex items-center gap-1 ${activeAgentIndex === 0 ? "text-purple-500" : "text-slate-400 dark:text-slate-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${activeAgentIndex === 0 ? "bg-purple-500 animate-pulse" : "bg-slate-400 dark:bg-slate-600"}`} />
                        {activeAgentIndex === 0 ? "SCANNING" : "STANDBY"}
                      </span>
                      <button
                        onClick={() => setActiveLogModal("scout")}
                        className="text-[11px] text-purple-650 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-bold tracking-tight cursor-pointer flex items-center gap-0.5 transition-colors"
                      >
                        View Full Logs →
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Synthesizer Writer Agent */}
                  <div className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between bg-white dark:bg-slate-900 min-h-[300px] glow-card ${
                    activeAgentIndex === 1
                      ? "border-blue-500/70 dark:border-blue-500/50 shadow-[0_0_25px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/10 dark:ring-blue-500/20"
                      : "border-slate-200 dark:border-slate-800"
                  }`}>
                    <div>
                      {/* Clean badge & icon */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase font-mono tracking-wider">
                          Officer Beta
                        </span>
                        <Edit className="h-4.5 w-4.5 text-blue-500" />
                      </div>

                      {/* Agent avatar profile block */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`h-11 w-11 rounded-full overflow-hidden bg-slate-150 dark:bg-slate-800 border shrink-0 transition-all duration-300 ${
                          activeAgentIndex === 1
                            ? "border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.4)] scale-105"
                            : "border-slate-250 dark:border-slate-700"
                        }`}>
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

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                        Converts trend points into pristine structured prose, charts, markdown metrics, and code parameters.
                      </p>

                      {/* Filtered realtime logs */}
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-3.5">
                        <p className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">Live Logs Feed</p>
                        <div className="max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin">
                          {agentWriterLogs.length === 0 ? (
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 italic">Standby. Awaiting Scout inputs...</p>
                          ) : (
                            agentWriterLogs.slice(-3).map((log, index) => (
                              <div key={index} className="text-[10px] text-slate-600 dark:text-slate-350 leading-normal pl-2.5 border-l-2 border-blue-500/40 font-mono">
                                {log.message}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold flex items-center gap-1 ${activeAgentIndex === 1 ? "text-blue-500" : "text-slate-400 dark:text-slate-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${activeAgentIndex === 1 ? "bg-blue-500 animate-pulse" : "bg-slate-400 dark:bg-slate-600"}`} />
                        {activeAgentIndex === 1 ? "DRAFTING" : "STANDBY"}
                      </span>
                      <button
                        onClick={() => setActiveLogModal("writer")}
                        className="text-[11px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold tracking-tight cursor-pointer flex items-center gap-0.5 transition-colors"
                      >
                        View Full Logs →
                      </button>
                    </div>
                  </div>

                  {/* Card 3: Evaluator Critic Agent */}
                  <div className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between bg-white dark:bg-slate-900 min-h-[300px] glow-card ${
                    activeAgentIndex === 2
                      ? "border-emerald-500/70 dark:border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/10 dark:ring-emerald-500/20"
                      : "border-slate-200 dark:border-slate-800"
                  }`}>
                    <div>
                      {/* Clean badge & icon */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase font-mono tracking-wider">
                          Officer Gamma
                        </span>
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                      </div>

                      {/* Agent avatar profile */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`h-11 w-11 rounded-full overflow-hidden bg-slate-150 dark:bg-slate-800 border shrink-0 transition-all duration-300 ${
                          activeAgentIndex === 2
                            ? "border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)] scale-105"
                            : "border-slate-250 dark:border-slate-700"
                        }`}>
                          <img
                            src="/src/assets/images/newsletter_hero_banner_1781615861452.jpg"
                            alt="Critic AI"
                            className="w-full h-full object-cover shrink-0 select-none cursor-default"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Reviewer-Gamma</h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Compliance Critic</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                        Performs rule validation audits, checking margins, structuring markdown, and stamping verified releases.
                      </p>

                      {/* Filtered realtime logs */}
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-3.5">
                        <p className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">Live Logs Feed</p>
                        <div className="max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin">
                          {agentEditorLogs.length === 0 ? (
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 italic">Standby. Ready to check compliance...</p>
                          ) : (
                            agentEditorLogs.slice(-3).map((log, index) => (
                              <div key={index} className="text-[10px] text-slate-600 dark:text-slate-350 leading-normal pl-2.5 border-l-2 border-emerald-500/40 font-mono">
                                {log.message}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold flex items-center gap-1 ${activeAgentIndex === 2 ? "text-emerald-500" : "text-slate-400 dark:text-slate-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${activeAgentIndex === 2 ? "bg-emerald-500 animate-pulse" : "bg-slate-400 dark:bg-slate-600"}`} />
                        {activeAgentIndex === 2 ? "AUDITING" : "STANDBY"}
                      </span>
                      <button
                        onClick={() => setActiveLogModal("editor")}
                        className="text-[11px] text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-350 font-bold tracking-tight cursor-pointer flex items-center gap-0.5 transition-colors"
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
                              <span>PUB SNAP: #{selectedHistoryId ? String(selectedHistoryId).slice(-6) : "PENDING"}</span>
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
          ) : activeSubTab === "cooperation" ? (
            <div style={{background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0d1117 100%)", borderRadius: "24px", overflow: "hidden", border: "1px solid rgba(99,102,241,0.15)", minHeight: "600px", display: "flex", flexDirection: "column"}}>

              {/* Group chat header */}
              <div style={{background: "rgba(15,15,30,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(99,102,241,0.2)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px"}}>
                <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                  <div style={{position: "relative"}}>
                    <div style={{width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", boxShadow: "0 0 20px rgba(99,102,241,0.4)"}}>🤖</div>
                    <div style={{position: "absolute", bottom: "1px", right: "1px", width: "11px", height: "11px", borderRadius: "50%", background: "#22c55e", border: "2px solid #0f0f1a"}}></div>
                  </div>
                  <div>
                    <div style={{fontWeight: "800", fontSize: "14px", color: "#f1f5f9", letterSpacing: "-0.3px"}}>Agent Fleet — Group Chat</div>
                    <div style={{fontSize: "11px", color: "#94a3b8", marginTop: "2px"}}>
                      {interactions.length > 0 ? `${interactions.length} messages · Last run cycle` : "Awaiting pipeline activation..."}
                    </div>
                  </div>
                </div>
                {/* Participant avatars row */}
                <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                  {[
                    {emoji: "🔭", color: "#8b5cf6", label: "Scout"},
                    {emoji: "✍️", color: "#f59e0b", label: "Writer"},
                    {emoji: "🧠", color: "#06b6d4", label: "Memory"},
                    {emoji: "🛡️", color: "#ef4444", label: "Guard"},
                    {emoji: "⚖️", color: "#22c55e", label: "Eval"},
                    {emoji: "🔎", color: "#f97316", label: "Fact"},
                  ].map(p => (
                    <div key={p.label} title={p.label} style={{width: "30px", height: "30px", borderRadius: "50%", background: `${p.color}22`, border: `2px solid ${p.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", cursor: "default"}}>
                      {p.emoji}
                    </div>
                  ))}
                  <button
                    onClick={fetchDashboardTelemetry}
                    style={{marginLeft: "8px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", fontWeight: "700", fontSize: "11px", padding: "5px 12px", borderRadius: "20px", cursor: "pointer", transition: "all 0.2s"}}
                    onMouseOver={e => (e.currentTarget.style.background = "rgba(99,102,241,0.3)")}
                    onMouseOut={e => (e.currentTarget.style.background = "rgba(99,102,241,0.15)")}
                  >
                    ↻ Sync
                  </button>
                </div>
              </div>

              {/* Chat body */}
              <div style={{flex: 1, overflowY: "auto", padding: "20px 20px 12px", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "520px"}}>
                {interactions.length === 0 ? (
                  <div style={{flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "60px 20px"}}>
                    <div style={{fontSize: "48px", opacity: 0.4}}>💬</div>
                    <p style={{color: "#64748b", fontSize: "13px", textAlign: "center", maxWidth: "280px", lineHeight: "1.6"}}>No active agent conversations yet. Wake up the newsroom to start a pipeline run.</p>
                  </div>
                ) : (() => {
                  // Agent config map
                  const agentConfig: Record<string, {emoji: string; color: string; bg: string; name: string}> = {
                    "Scout": {emoji: "🔭", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", name: "Trend Scout (A)"},
                    "Trend Scout": {emoji: "🔭", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", name: "Trend Scout (A)"},
                    "Agent A": {emoji: "🔭", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", name: "Trend Scout (A)"},
                    "Writer": {emoji: "✍️", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", name: "The Writer (B)"},
                    "Agent B": {emoji: "✍️", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", name: "The Writer (B)"},
                    "Memory Layer": {emoji: "🧠", color: "#06b6d4", bg: "rgba(6,182,212,0.12)", name: "Memory Layer"},
                    "Memory": {emoji: "🧠", color: "#06b6d4", bg: "rgba(6,182,212,0.12)", name: "Memory Layer"},
                    "System Memory": {emoji: "🧠", color: "#06b6d4", bg: "rgba(6,182,212,0.12)", name: "Memory Layer"},
                    "Evaluation Guardrail": {emoji: "🛡️", color: "#ef4444", bg: "rgba(239,68,68,0.12)", name: "Security Guard"},
                    "Guardrail": {emoji: "🛡️", color: "#ef4444", bg: "rgba(239,68,68,0.12)", name: "Security Guard"},
                    "Evaluator": {emoji: "⚖️", color: "#22c55e", bg: "rgba(34,197,94,0.12)", name: "Evaluator (C)"},
                    "Agent C": {emoji: "⚖️", color: "#22c55e", bg: "rgba(34,197,94,0.12)", name: "Evaluator (C)"},
                    "Fact Checker": {emoji: "🔎", color: "#f97316", bg: "rgba(249,115,22,0.12)", name: "Fact Checker (D)"},
                    "Agent D": {emoji: "🔎", color: "#f97316", bg: "rgba(249,115,22,0.12)", name: "Fact Checker (D)"},
                    "Orchestrator": {emoji: "🎯", color: "#a78bfa", bg: "rgba(167,139,250,0.10)", name: "Orchestrator"},
                    "System": {emoji: "⚙️", color: "#64748b", bg: "rgba(100,116,139,0.12)", name: "System"},
                    "RAG Fetcher": {emoji: "📚", color: "#0ea5e9", bg: "rgba(14,165,233,0.12)", name: "RAG Fetcher"},
                    "Streamlit Portal": {emoji: "🖥️", color: "#64748b", bg: "rgba(100,116,139,0.08)", name: "Portal"},
                  };
                  const getConfig = (name: string) => {
                    for (const key of Object.keys(agentConfig)) {
                      if (name?.includes(key)) return agentConfig[key];
                    }
                    return {emoji: "🤖", color: "#94a3b8", bg: "rgba(148,163,184,0.12)", name: name || "Agent"};
                  };

                  let lastSender = "";
                  return interactions.map((msg: any, idx: number) => {
                    const sender = msg.sender || msg.agent || "System";
                    const receiver = msg.receiver || "";
                    const timeStr = msg.timestamp || "";
                    const text = msg.message || "";
                    const cfg = getConfig(sender);
                    const isNewSender = sender !== lastSender;
                    lastSender = sender;

                    return (
                      <div key={idx} style={{display: "flex", flexDirection: "column", gap: "2px", marginTop: isNewSender && idx !== 0 ? "14px" : "2px"}}>
                        {/* Sender label — only shown when sender changes */}
                        {isNewSender && (
                          <div style={{display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px", paddingLeft: "4px"}}>
                            <div style={{width: "30px", height: "30px", borderRadius: "50%", background: cfg.bg, border: `2px solid ${cfg.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0, boxShadow: `0 0 10px ${cfg.color}20`}}>
                              {cfg.emoji}
                            </div>
                            <span style={{fontWeight: "700", fontSize: "12px", color: cfg.color, letterSpacing: "-0.2px"}}>{cfg.name}</span>
                            {receiver && (
                              <span style={{fontSize: "10px", color: "#475569", background: "rgba(71,85,105,0.2)", padding: "1px 7px", borderRadius: "20px"}}>
                                → {getConfig(receiver).name}
                              </span>
                            )}
                            {timeStr && <span style={{fontSize: "10px", color: "#475569", marginLeft: "auto"}}>{timeStr}</span>}
                          </div>
                        )}

                        {/* Chat bubble */}
                        <div style={{
                          marginLeft: "37px",
                          background: cfg.bg,
                          border: `1px solid ${cfg.color}25`,
                          borderRadius: isNewSender ? "4px 18px 18px 18px" : "4px 18px 18px 4px",
                          padding: "10px 14px",
                          maxWidth: "88%",
                          position: "relative",
                          boxShadow: `0 2px 8px ${cfg.color}10`,
                        }}>
                          <p style={{fontSize: "12.5px", color: "#cbd5e1", lineHeight: "1.65", fontFamily: "sans-serif", whiteSpace: "pre-wrap", margin: 0}}>{text}</p>
                          {!isNewSender && timeStr && (
                            <span style={{display: "block", fontSize: "9.5px", color: "#475569", marginTop: "5px", textAlign: "right"}}>{timeStr}</span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Chat input bar (decorative — shows pipeline is live) */}
              <div style={{background: "rgba(15,15,30,0.95)", borderTop: "1px solid rgba(99,102,241,0.15)", padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px"}}>
                <div style={{flex: 1, background: "rgba(30,30,50,0.8)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "24px", padding: "10px 16px", fontSize: "12px", color: "#475569", userSelect: "none"}}>
                  Agent messages appear here during pipeline execution...
                </div>
                <div style={{width: "38px", height: "38px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", cursor: "default", opacity: 0.5}}>
                  ➤
                </div>
              </div>
            </div>
          ) : activeSubTab === "logs" ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xs transition-colors duration-200">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 flex-wrap gap-2">
                <div>
                  <h2 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                    <History className="h-5 w-5 text-blue-500" />
                    Live Agent Execution History (Server Logs)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Telemetry records of past multi-agent execution runs stored on the server.
                  </p>
                </div>
                <button
                  onClick={fetchDashboardTelemetry}
                  className="bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-705 dark:text-slate-300 font-bold text-xs px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  Reload Logs
                </button>
              </div>

              {serverHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-xs text-slate-500">No runs recorded on the server yet. Trigger a manual run to generate logs.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {[...serverHistory].reverse().map((run: any, idx: number) => {
                    const runTime = run.timestamp ? new Date(run.timestamp).toLocaleString() : "Unknown Time";
                    const isSuccess = run.status === "success";
                    const score = run.agent_c?.score || 0;
                    const nicheLabel = run.niche || "General Niche";

                    return (
                      <details
                        key={idx}
                        className="group border border-slate-200 dark:border-slate-800 rounded-2xl bg-[#F8FAFC]/55 dark:bg-slate-900/40 overflow-hidden transition-all text-slate-800 dark:text-slate-100"
                        open={idx === 0}
                      >
                        <summary className="flex justify-between items-center p-4 cursor-pointer font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800/40 select-none">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`h-2 w-2 rounded-full ${isSuccess ? "bg-emerald-500" : "bg-red-500"}`} />
                            <span className="text-slate-800 dark:text-slate-200 font-mono text-[10px]">{runTime}</span>
                            <span className="bg-blue-50 dark:bg-blue-900/20 text-[#1D63ED] dark:text-blue-400 px-2 py-0.5 rounded text-[9.5px] uppercase font-mono font-bold">{nicheLabel}</span>
                          </div>
                          <span className="text-slate-900 dark:text-slate-150 font-bold text-xs">Quality: {score}/100</span>
                        </summary>
                        
                        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-4 text-xs">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                                <Search className="h-3.5 w-3.5 text-purple-500" />
                                Agent A — Trend Scout
                              </h4>
                              <p className="text-[10px] text-slate-400">Source: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[9.5px] text-slate-600 dark:text-slate-350">{run.agent_a?.source || "N/A"}</code></p>
                              <div className="space-y-1 pl-1">
                                {run.agent_a?.headlines_pulled?.length > 0 ? (
                                  run.agent_a.headlines_pulled.map((h: string, hIdx: number) => (
                                    <div key={hIdx} className="text-[10.5px] text-slate-655 dark:text-slate-400 pl-2.5 border-l border-slate-200 dark:border-slate-800 leading-relaxed">• {h}</div>
                                  ))
                                ) : (
                                  <p className="italic text-[10px] text-slate-400">No headlines recorded.</p>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/60 pb-1.5">
                                <FileCode className="h-3.5 w-3.5 text-amber-500" />
                                Agent B — Writer Telemetry
                              </h4>
                              <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg"><span className="text-slate-450">Attempts:</span> <strong className="float-right text-slate-800 dark:text-slate-200">{run.agent_b?.attempts || 1}</strong></div>
                                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg"><span className="text-slate-450">Total Tokens:</span> <strong className="float-right text-slate-800 dark:text-slate-200">{run.agent_b?.total_tokens?.toLocaleString() || 0}</strong></div>
                                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg"><span className="text-slate-455">Prompt Tokens:</span> <strong className="float-right text-slate-800 dark:text-slate-200">{run.agent_b?.prompt_tokens?.toLocaleString() || 0}</strong></div>
                                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg"><span className="text-slate-455">Output Tokens:</span> <strong className="float-right text-slate-800 dark:text-slate-200">{run.agent_b?.output_tokens?.toLocaleString() || 0}</strong></div>
                              </div>
                              {run.agent_b?.violations?.length > 0 && (
                                <div className="space-y-1.5 mt-2 bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-xl">
                                  <div className="font-bold text-amber-600 dark:text-amber-500 text-[10px] uppercase font-mono tracking-wide">Fixed Guardrail Violations:</div>
                                  {run.agent_b.violations.map((v: string, vIdx: number) => (
                                    <div key={vIdx} className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">• {v}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 bg-[#F8FAFC]/30 dark:bg-slate-900/20 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/40">
                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              Agent C Verdict: <span className={run.agent_c?.passed ? "text-emerald-500" : "text-red-500"}>{run.agent_c?.passed ? "APPROVED" : "REVIEW NEEDED"}</span>
                            </div>
                            {run.agent_c?.notes && <p className="text-slate-500 dark:text-slate-400 italic text-[11px] leading-relaxed">"{run.agent_c.notes}"</p>}
                          </div>
                          
                          {run.error && (
                            <div className="bg-red-500/5 border border-red-500/20 p-3 rounded-xl text-red-600 dark:text-red-400 font-mono text-[10px] whitespace-pre-wrap">
                              Error: {run.error}
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeSubTab === "archive" ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xs transition-colors duration-200">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 flex-wrap gap-2">
                <div>
                  <h2 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                    <Archive className="h-5 w-5 text-blue-500" />
                    Server Newsletter Drafts Archive
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">
                    Browse completed issues saved automatically to the server's <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">newsletters/</code> directory.
                  </p>
                </div>
                <button
                  onClick={fetchDashboardTelemetry}
                  className="bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-705 dark:text-slate-300 font-bold text-xs px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                >
                  Scan Directory
                </button>
              </div>

              {serverDrafts.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-xs text-slate-500">No archived drafts found in the newsletters/ directory yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
                  <div className="lg:col-span-4 space-y-2 border-r border-slate-100 dark:border-slate-800 pr-4 max-h-[500px] overflow-y-auto">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono mb-2">Available Drafts ({serverDrafts.length})</p>
                    {serverDrafts.map((dName) => {
                      const isActive = selectedDraftName === dName;
                      return (
                        <div
                          key={dName}
                          onClick={() => setSelectedDraftName(dName)}
                          className={`p-3 rounded-xl border text-[11px] font-mono cursor-pointer transition-all truncate ${
                            isActive
                              ? "bg-blue-50/60 border-blue-500/60 text-[#1D63ED] dark:bg-blue-950/20 dark:border-blue-500/50 dark:text-blue-400 shadow-xs font-bold"
                              : "bg-[#F8FAFC] border-slate-200/80 hover:bg-slate-50 text-slate-600 dark:bg-slate-800/30 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                          }`}
                          title={dName}
                        >
                          📄 {dName}
                        </div>
                      );
                    })}
                  </div>

                  <div className="lg:col-span-8 space-y-4 max-h-[500px] overflow-y-auto pl-2">
                    {selectedDraftContent ? (
                      <div className="space-y-4 text-slate-800 dark:text-slate-200">
                        {(() => {
                          const parts = selectedDraftContent.split("---\n\n");
                          if (parts.length >= 2 && selectedDraftContent.startsWith("---")) {
                            const metaBlock = parts[0];
                            const bodyText = parts.slice(1).join("---\n\n");
                            return (
                              <>
                                <details className="border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/65 overflow-hidden">
                                  <summary className="p-3 font-bold text-[10px] font-mono uppercase tracking-wider cursor-pointer select-none">
                                    📋 Engine Metadata (YAML)
                                  </summary>
                                  <pre className="p-4 text-[10px] text-slate-600 dark:text-slate-350 font-mono bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-850 overflow-x-auto whitespace-pre-wrap">
                                    {metaBlock.replace(/---/g, "").trim()}
                                  </pre>
                                </details>
                                <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans bg-slate-50 dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-inner">
                                  {bodyText}
                                </div>
                              </>
                            );
                          }
                          return (
                            <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans bg-slate-50 dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-inner">
                              {selectedDraftContent}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-400">
                        <p className="text-xs">Loading content...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : activeSubTab === "analytics" ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xs transition-colors duration-200">
              <div>
                <h2 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-blue-500" />
                  Analytics & Token Cost Insights
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">
                  Visualization of token consumption, rewrite cycles, and quality score telemetry trends.
                </p>
              </div>

              {serverHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-xs text-slate-550">Run the pipeline at least once to see analytics data.</p>
                </div>
              ) : (
                <div className="space-y-8 animate-fadeIn">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-slate-100 dark:border-slate-800 p-5 rounded-2xl bg-[#F8FAFC]/55 dark:bg-slate-900/35 space-y-3">
                      <h4 className="font-bold text-xs text-slate-850 dark:text-slate-200">📊 Token Consumption per Run</h4>
                      {(() => {
                        const runs = serverHistory.slice(-10);
                        const maxTokens = Math.max(...runs.map((r) => r.agent_b?.total_tokens || 100), 1000);
                        return (
                          <div className="h-48 flex items-end justify-between gap-1 pt-4 border-b border-l border-slate-250 dark:border-slate-850 px-2">
                            {runs.map((r: any, idx: number) => {
                              const prompt = r.agent_b?.prompt_tokens || 0;
                              const output = r.agent_b?.output_tokens || 0;
                              const total = prompt + output;
                              const promptPct = (prompt / maxTokens) * 100;
                              const outputPct = (output / maxTokens) * 100;
                              return (
                                <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[9.5px] p-2 rounded-lg shadow-md font-mono pointer-events-none transition-all z-20 w-28 text-center">
                                    Prompt: {prompt.toLocaleString()}<br/>
                                    Output: {output.toLocaleString()}<br/>
                                    Total: {total.toLocaleString()}
                                  </div>
                                  <div style={{ height: `${outputPct}%` }} className="w-4 bg-blue-500 rounded-t-xs transition-all duration-500" />
                                  <div style={{ height: `${promptPct}%` }} className="w-4 bg-sky-300 dark:bg-sky-500/60 rounded-b-xs transition-all duration-500" />
                                  <span className="text-[8px] text-slate-400 dark:text-slate-500 mt-2 font-mono truncate max-w-[32px]">#{idx + 1}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                      <div className="flex justify-center gap-4 text-[10px] text-slate-550 dark:text-slate-400 mt-1">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-300 dark:bg-sky-500/60" /> Prompt Tokens</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Output Tokens</span>
                      </div>
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 p-5 rounded-2xl bg-[#F8FAFC]/55 dark:bg-slate-900/35 space-y-3">
                      <h4 className="font-bold text-xs text-slate-850 dark:text-slate-200">🏆 Agent C Quality Score Trend</h4>
                      {(() => {
                        const runs = serverHistory.slice(-10);
                        const points = runs.map((r: any, idx: number) => {
                          const score = r.agent_c?.score || 0;
                          const x = (idx / (runs.length - 1 || 1)) * 100;
                          const y = 100 - score;
                          return `${x},${y}`;
                        }).join(" ");
                        
                        return (
                          <div className="relative h-48 border-b border-l border-slate-250 dark:border-slate-850 px-2 pt-4">
                            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                              <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" className="text-slate-100 dark:text-slate-850" strokeWidth="0.5" />
                              <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" className="text-slate-100 dark:text-slate-850" strokeWidth="0.5" />
                              <line x1="0" y1="80" x2="100" y2="80" stroke="currentColor" className="text-slate-100 dark:text-slate-850" strokeWidth="0.5" />
                              
                              {runs.length > 1 && (
                                <polyline
                                  fill="none"
                                  stroke="#3b82f6"
                                  strokeWidth="2.5"
                                  points={points}
                                  className="transition-all duration-1000"
                                />
                              )}
                              
                              {runs.map((r: any, idx: number) => {
                                const score = r.agent_c?.score || 0;
                                const x = (idx / (runs.length - 1 || 1)) * 100;
                                const y = 100 - score;
                                return (
                                  <circle
                                    key={idx}
                                    cx={x}
                                    cy={y}
                                    r="2.5"
                                    fill="#1D63ED"
                                    className="cursor-pointer hover:r-4 transition-all duration-200"
                                    title={`Run #${idx+1}: ${score}/100`}
                                  />
                                );
                              })}
                            </svg>
                            <span className="absolute top-1 left-1 text-[8px] text-slate-400 font-mono">100</span>
                            <span className="absolute top-1/2 left-1 -translate-y-1/2 text-[8px] text-slate-400 font-mono">50</span>
                            <span className="absolute bottom-1 left-1 text-[8px] text-slate-400 font-mono">0</span>
                          </div>
                        );
                      })()}
                      <p className="text-[10px] text-slate-400 text-center italic mt-1">Shows quality score out of 100 over the last 10 execution runs.</p>
                    </div>
                  </div>

                  <div className="border border-slate-100 dark:border-slate-800 p-5 rounded-2xl bg-[#F8FAFC]/55 dark:bg-slate-900/35 space-y-3">
                    <h4 className="font-bold text-xs text-slate-850 dark:text-slate-200">📈 System Aggregated Stats</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-505 dark:text-slate-400 border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-mono text-slate-400">
                            <th className="py-2.5 px-3">Metric Variable</th>
                            <th className="py-2.5 px-3 text-right">Average Value</th>
                            <th className="py-2.5 px-3 text-right">Maximum Recorded</th>
                            <th className="py-2.5 px-3 text-right">Minimum Recorded</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                          {(() => {
                            const scores = serverHistory.map((r) => r.agent_c?.score || 0);
                            const tokens = serverHistory.map((r) => r.agent_b?.total_tokens || 0);
                            const attempts = serverHistory.map((r) => r.agent_b?.attempts || 1);

                            const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a,b)=>a+b, 0) / arr.length) : 0;
                            const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : 0;
                            const min = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : 0;

                            return (
                              <>
                                <tr>
                                  <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">Agent C Quality Score</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{avg(scores)}/100</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{max(scores)}/100</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{min(scores)}/100</td>
                                </tr>
                                <tr>
                                  <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">Token Consumption per Run</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{avg(tokens).toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{max(tokens).toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{min(tokens).toLocaleString()}</td>
                                </tr>
                                <tr>
                                  <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">Agent B Rewrite Attempts</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{avg(attempts).toFixed(1)}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{max(attempts)}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200 font-mono">{min(attempts)}</td>
                                </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeSubTab === "observability" ? (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-4 shadow-xs transition-colors duration-200">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800 flex-wrap gap-2">
                  <div>
                    <h2 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                      <Activity className="h-5 w-5 text-blue-500" />
                      Agent Observability & OpenTelemetry Spans
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">
                      Trace pipeline executions, token cost allocations, latency distribution, and guardrail failure analytics.
                    </p>
                  </div>
                  <button
                    onClick={() => fetchDashboardTelemetry()}
                    className="bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-705 dark:text-slate-300 font-bold text-xs px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    Refresh Telemetry
                  </button>
                </div>

                {serverHistory.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <p className="text-xs text-slate-550">Run the newsletter pipeline to generate OpenTelemetry trace logs.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Trace List */}
                    <div className="lg:col-span-4 space-y-2 border-r border-slate-100 dark:border-slate-800 pr-4 max-h-[600px] overflow-y-auto">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wider font-mono mb-2">Execution Logs ({serverHistory.length})</p>
                      {[...serverHistory].reverse().map((run: any, idx: number) => {
                        const runIdx = serverHistory.indexOf(run);
                        const isSelected = selectedObsRunId === null ? runIdx === serverHistory.length - 1 : selectedObsRunId === runIdx;
                        const duration = run.telemetry?.total_duration_ms ? (run.telemetry.total_duration_ms / 1000).toFixed(2) : "N/A";
                        const cost = run.telemetry?.total_cost_usd !== undefined ? run.telemetry.total_cost_usd : "0.00";
                        const isSuccess = run.status === "success";

                        return (
                          <div
                            key={runIdx}
                            onClick={() => setSelectedObsRunId(runIdx)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? "bg-blue-50/60 border-blue-500/60 text-[#1D63ED] dark:bg-blue-950/20 dark:border-blue-500/50 dark:text-blue-400 shadow-xs font-bold"
                                : "bg-[#F8FAFC] border-slate-200/80 hover:bg-slate-50 text-slate-600 dark:bg-slate-800/30 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                          >
                            <div className="flex justify-between items-center gap-1">
                              <span className="text-[11px] font-mono">Run #{runIdx + 1}</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold ${
                                isSuccess
                                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-450"
                                  : "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-450"
                              }`}>
                                {isSuccess ? "Success" : "Failed"}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1 font-mono flex justify-between">
                              <span>{run.model || "Unknown model"}</span>
                              <span>{duration}s</span>
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5 flex justify-between font-mono">
                              <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                              <span>${cost}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right Column: Observability Detail */}
                    <div className="lg:col-span-8 space-y-6 max-h-[600px] overflow-y-auto pl-2">
                      {(() => {
                        const runIdx = selectedObsRunId === null ? serverHistory.length - 1 : selectedObsRunId;
                        const run = serverHistory[runIdx];
                                const tel = run.telemetry || {};
                        const spans = tel.spans || [];
                        const duration = tel.total_duration_ms ? (tel.total_duration_ms / 1000).toFixed(2) : "N/A";
                        const cost = tel.total_cost_usd !== undefined ? tel.total_cost_usd : "0.00";
                        
                        // Parse agent details
                        const agentADur = tel.agent_a_duration_ms ? (tel.agent_a_duration_ms / 1000).toFixed(2) : "0.00";
                        const agentBDur = tel.agent_b_duration_ms ? (tel.agent_b_duration_ms / 1000).toFixed(2) : "0.00";
                        const agentCDur = tel.agent_c_duration_ms ? (tel.agent_c_duration_ms / 1000).toFixed(2) : "0.00";

                        const ragMs = spans.find((s: any) => s.name === "rag_fetcher")?.duration_ms || 0;
                        const ragDur = (ragMs / 1000).toFixed(2);
                        const agentDMs = tel.agent_d_duration_ms || 0;
                        const agentDDur = (agentDMs / 1000).toFixed(2);

                        const totalMs = tel.total_duration_ms || 1;
                        const pctA = ((tel.agent_a_duration_ms || 0) / totalMs) * 100;
                        const pctRag = (ragMs / totalMs) * 100;
                        const pctB = ((tel.agent_b_duration_ms || 0) / totalMs) * 100;
                        const pctC = ((tel.agent_c_duration_ms || 0) / totalMs) * 100;
                        const pctD = (agentDMs / totalMs) * 100;

                        const fail = tel.failures || {};
                        const violations = fail.violations_count || 0;
                        const attempts = fail.attempts_count || 1;
                        const apiErrors = fail.api_errors_count || 0;

                        return (
                          <div className="space-y-6">
                            {/* Overview Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div className="border border-slate-100 dark:border-slate-800 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                                <span className="text-[9px] uppercase tracking-wider text-slate-450 block font-mono">Total Latency</span>
                                <strong className="text-sm text-slate-800 dark:text-slate-200 font-mono">{duration}s</strong>
                              </div>
                              <div className="border border-slate-100 dark:border-slate-800 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                                <span className="text-[9px] uppercase tracking-wider text-slate-450 block font-mono">Token Cost</span>
                                <strong className="text-sm text-slate-800 dark:text-slate-200 font-mono">${cost}</strong>
                              </div>
                              <div className="border border-slate-100 dark:border-slate-800 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                                <span className="text-[9px] uppercase tracking-wider text-slate-450 block font-mono">OTel Spans</span>
                                <strong className="text-sm text-slate-800 dark:text-slate-200 font-mono">{spans.length} spans</strong>
                              </div>
                              <div className="border border-slate-100 dark:border-slate-800 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                                <span className="text-[9px] uppercase tracking-wider text-slate-450 block font-mono">Model Target</span>
                                <strong className="text-xs text-slate-800 dark:text-slate-200 font-mono truncate block" title={run.model}>{run.model || "Router"}</strong>
                              </div>
                            </div>

                            {/* Agent Execution Timeline Chart */}
                            <div className="border border-slate-150 dark:border-slate-800 p-4 rounded-2xl bg-[#F8FAFC]/40 dark:bg-slate-900/20 space-y-4">
                              <div className="flex justify-between items-center">
                                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                                  Agent Execution Timeline (OTel Spans)
                                </h4>
                                <span className="text-[9px] font-mono text-slate-400">Trace ID: {spans[0]?.context?.traceId || "N/A"}</span>
                              </div>

                              <div className="space-y-3.5 pt-2">
                                {/* Agent A Bar */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-slate-505">
                                    <span className="font-semibold text-slate-750 dark:text-slate-300">Agent A (Trend Scout)</span>
                                    <span className="font-mono text-slate-700 dark:text-slate-350">{agentADur}s</span>
                                  </div>
                                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                                    <div
                                      style={{
                                        width: `${Math.max(10, pctA)}%`,
                                        marginLeft: "0%"
                                      }}
                                      className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full flex items-center px-2 text-[8px] text-white font-bold font-mono"
                                    >
                                      Trend Scout
                                    </div>
                                  </div>
                                </div>

                                {/* RAG Fetcher Bar */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-slate-505">
                                    <span className="font-semibold text-slate-750 dark:text-slate-300">RAG Fetcher (Full-Article Vectorization)</span>
                                    <span className="font-mono text-slate-700 dark:text-slate-350">{ragDur}s</span>
                                  </div>
                                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                                    <div
                                      style={{
                                        width: `${Math.max(10, pctRag)}%`,
                                        marginLeft: `${pctA}%`
                                      }}
                                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full flex items-center px-2 text-[8px] text-white font-bold font-mono"
                                    >
                                      RAG Fetcher
                                    </div>
                                  </div>
                                </div>

                                {/* Agent B Bar */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-slate-505">
                                    <span className="font-semibold text-slate-750 dark:text-slate-300">Agent B (Writer)</span>
                                    <span className="font-mono text-slate-700 dark:text-slate-350">{agentBDur}s</span>
                                  </div>
                                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                                    <div
                                      style={{
                                        width: `${Math.max(10, pctB)}%`,
                                        marginLeft: `${pctA + pctRag}%`
                                      }}
                                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-550 rounded-full flex items-center px-2 text-[8px] text-white font-bold font-mono"
                                    >
                                      Writer
                                    </div>
                                  </div>
                                </div>

                                {/* Agent C Bar */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-slate-505">
                                    <span className="font-semibold text-slate-750 dark:text-slate-300">Agent C (Evaluator)</span>
                                    <span className="font-mono text-slate-700 dark:text-slate-350">{agentCDur}s</span>
                                  </div>
                                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                                    <div
                                      style={{
                                        width: `${Math.max(10, pctC)}%`,
                                        marginLeft: `${pctA + pctRag + pctB}%`
                                      }}
                                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full flex items-center px-2 text-[8px] text-white font-bold font-mono"
                                    >
                                      Evaluator
                                    </div>
                                  </div>
                                </div>

                                {/* Agent D Bar */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-slate-505">
                                    <span className="font-semibold text-slate-750 dark:text-slate-300">Agent D (Fact Checker)</span>
                                    <span className="font-mono text-slate-700 dark:text-slate-350">{agentDDur}s</span>
                                  </div>
                                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                                    <div
                                      style={{
                                        width: `${Math.max(10, pctD)}%`,
                                        marginLeft: `${pctA + pctRag + pctB + pctC}%`
                                      }}
                                      className="h-full bg-gradient-to-r from-rose-500 to-orange-400 rounded-full flex items-center px-2 text-[8px] text-white font-bold font-mono"
                                    >
                                      Fact Checker
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Failure Analytics & Token Costs Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {/* Failure Analytics */}
                              <div className="border border-slate-150 dark:border-slate-800 p-4 rounded-xl bg-slate-50/30 dark:bg-slate-900/10 space-y-3">
                                <h4 className="font-bold text-xs text-slate-850 dark:text-slate-200 flex items-center gap-1.5">
                                  <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                                  Guardrail Analytics
                                </h4>
                                <div className="space-y-2 pt-1 text-[11px]">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Violations Caught</span>
                                    <strong className="font-mono text-amber-600 dark:text-amber-450">{violations}</strong>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Rewrite Attempts</span>
                                    <strong className="font-mono text-indigo-600 dark:text-indigo-400">{attempts}</strong>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Gateway Errors</span>
                                    <strong className="font-mono text-rose-600 dark:text-rose-450">{apiErrors}</strong>
                                  </div>
                                </div>
                              </div>

                              {/* RAG & Fact Checker Analytics */}
                              <div className="border border-slate-150 dark:border-slate-800 p-4 rounded-xl bg-slate-50/30 dark:bg-slate-900/10 space-y-3">
                                <h4 className="font-bold text-xs text-slate-850 dark:text-slate-200 flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                                  RAG & Fact Checker
                                </h4>
                                <div className="space-y-2 pt-1 text-[11px]">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Source Coverage</span>
                                    <strong className="font-mono text-blue-600 dark:text-blue-450">
                                      {run.agent_d?.score !== undefined ? `${run.agent_d.score}%` : "100%"}
                                    </strong>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Claims Verified</span>
                                    <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                                      {run.agent_d?.verified !== undefined ? `${run.agent_d.verified}/${run.agent_d.total}` : "N/A"}
                                    </strong>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Audit Verdict</span>
                                    <strong className={`font-mono ${run.agent_d?.passed === false ? "text-rose-500" : "text-emerald-500"}`}>
                                      {run.agent_d?.passed === false ? "FLAGGED ⚠️" : "PASSED ✅"}
                                    </strong>
                                  </div>
                                </div>
                              </div>

                              {/* Token cost tracking */}
                              <div className="border border-slate-150 dark:border-slate-800 p-4 rounded-xl bg-slate-50/30 dark:bg-slate-900/10 space-y-3">
                                <h4 className="font-bold text-xs text-slate-850 dark:text-slate-200 flex items-center gap-1.5">
                                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                                  Token Cost Breakdown
                                </h4>
                                <div className="space-y-2 pt-1 text-[11px]">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Agent A Tokens</span>
                                    <strong className="font-mono text-slate-700 dark:text-slate-350">
                                      {(run.agent_a?.headlines_pulled?.length || 0) * 150} tokens
                                    </strong>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Agent B Tokens</span>
                                    <strong className="font-mono text-slate-700 dark:text-slate-350">
                                      {(run.agent_b?.total_tokens || 0).toLocaleString()} tokens
                                    </strong>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Agent C/D Tokens</span>
                                    <strong className="font-mono text-slate-700 dark:text-slate-350">
                                      2,100 tokens
                                    </strong>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* OTel Span Tree list */}
                            <div className="border border-slate-150 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/40 dark:bg-slate-900/30 space-y-4">
                              <h4 className="font-bold text-xs text-slate-850 dark:text-slate-200">
                                🌲 Hierarchical OpenTelemetry Span Tree
                              </h4>
                              <div className="space-y-2.5 pt-1 font-mono text-[10px]">
                                {spans.map((span: any, sIdx: number) => {
                                  const depth = span.parent_span_id ? 1 : 0;
                                  return (
                                    <div
                                      key={sIdx}
                                      style={{ paddingLeft: `${depth * 16}px` }}
                                      className="border-l-2 border-blue-500/20 pl-2 space-y-1"
                                    >
                                      <div className="flex justify-between items-center bg-slate-100/50 dark:bg-slate-950/40 p-2 rounded-lg border border-slate-200/50 dark:border-slate-850">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-blue-600 dark:text-blue-400">❖</span>
                                          <strong className="text-slate-800 dark:text-slate-300">{span.name}</strong>
                                        </div>
                                        <span className="text-slate-450 font-semibold">{span.duration_ms}ms</span>
                                      </div>
                                      <div className="bg-slate-100/20 dark:bg-slate-950/20 p-2 rounded-lg text-[9px] text-slate-500 overflow-x-auto whitespace-pre-wrap max-w-full">
                                        <strong>Span ID:</strong> {span.context?.spanId} | <strong>Parent:</strong> {span.parent_span_id || "null"}<br/>
                                        <strong>Attributes:</strong> {JSON.stringify(span.attributes, null, 2)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xs transition-colors duration-200">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 flex-wrap gap-2">
                  <div>
                    <h2 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                      <Send className="h-5 w-5 text-[#1D63ED] dark:text-blue-400 animate-pulse" />
                      Publisher Outbox & Configuration
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">
                      Configure WordPress REST API and Webhooks, and inspect generated publication payloads.
                    </p>
                  </div>
                  <button
                    onClick={fetchOutboxPayloads}
                    className="bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-705 dark:text-slate-300 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    Refresh Outbox Payloads
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column: Publisher Configuration */}
                  <div className="lg:col-span-5 space-y-6 border-r border-slate-100 dark:border-slate-800/60 pr-6">
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-slate-450 uppercase tracking-wider font-mono">
                        ⚙️ Publishing Configuration
                      </h3>

                      {/* Dry Run Toggle */}
                      <div className="bg-[#F8FAFC]/55 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                            Dry Run Simulation Mode
                          </label>
                          <input
                            type="checkbox"
                            checked={pubConfig.dry_run}
                            onChange={(e) => savePublishingConfig({ ...pubConfig, dry_run: e.target.checked })}
                            className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-slate-450 dark:text-slate-500 leading-relaxed">
                          When enabled, publications are simulated, and mock payloads are saved locally without hitting live servers.
                        </p>
                      </div>

                      {/* WordPress Configuration Card */}
                      <div className="bg-[#F8FAFC]/55 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 space-y-3.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">🌐</span>
                            <span className="text-xs font-bold text-slate-705 dark:text-slate-300">WordPress Publisher</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={pubConfig.wordpress.enabled}
                            onChange={(e) => savePublishingConfig({
                              ...pubConfig,
                              wordpress: { ...pubConfig.wordpress, enabled: e.target.checked }
                            })}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                        
                        <div className="space-y-3 pt-1">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-455 uppercase font-mono tracking-wider">
                              REST API URL
                            </label>
                            <input
                              type="text"
                              value={pubConfig.wordpress.url}
                              onChange={(e) => setPubConfig({
                                ...pubConfig,
                                wordpress: { ...pubConfig.wordpress, url: e.target.value }
                              })}
                              placeholder="https://example.com/wp-json/wp/v2"
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-455 uppercase font-mono tracking-wider">
                              Username
                            </label>
                            <input
                              type="text"
                              value={pubConfig.wordpress.username}
                              onChange={(e) => setPubConfig({
                                ...pubConfig,
                                wordpress: { ...pubConfig.wordpress, username: e.target.value }
                              })}
                              placeholder="admin"
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-455 uppercase font-mono tracking-wider">
                              Password Env Variable Name
                            </label>
                            <input
                              type="text"
                              value={pubConfig.wordpress.password_env_var}
                              onChange={(e) => setPubConfig({
                                ...pubConfig,
                                wordpress: { ...pubConfig.wordpress, password_env_var: e.target.value }
                              })}
                              placeholder="WP_APPLICATION_PASSWORD"
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-slate-100"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Webhook Configuration Card */}
                      <div className="bg-[#F8FAFC]/55 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 space-y-3.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">🔗</span>
                            <span className="text-xs font-bold text-slate-705 dark:text-slate-300">Webhook Publisher</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={pubConfig.webhook.enabled}
                            onChange={(e) => savePublishingConfig({
                              ...pubConfig,
                              webhook: { ...pubConfig.webhook, enabled: e.target.checked }
                            })}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1 pt-1">
                          <label className="block text-[10px] font-bold text-slate-455 uppercase font-mono tracking-wider">
                            Webhook target URL
                          </label>
                          <input
                            type="text"
                            value={pubConfig.webhook.url}
                            onChange={(e) => setPubConfig({
                              ...pubConfig,
                              webhook: { ...pubConfig.webhook, url: e.target.value }
                            })}
                            placeholder="https://httpbin.org/post"
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      {/* Save Button */}
                      <button
                        onClick={() => savePublishingConfig(pubConfig)}
                        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
                      >
                        Save Publisher Configuration
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Outbox Payloads */}
                  <div className="lg:col-span-7 space-y-6">
                    <h3 className="text-xs font-bold text-slate-450 uppercase tracking-wider font-mono flex items-center justify-between">
                      <span>📦 Simulated Outbox Payloads</span>
                      {pubConfig.dry_run && (
                        <span className="text-[10px] text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded">
                          Dry-Run Logs Active
                        </span>
                      )}
                    </h3>

                    {!outboxPayloads.wordpress && !outboxPayloads.webhook ? (
                      <div className="border border-dashed border-slate-200 dark:border-slate-850 rounded-3xl p-12 text-center text-slate-450 space-y-3">
                        <Send className="h-10 w-10 mx-auto text-slate-350 dark:text-slate-750 animate-pulse" />
                        <div className="space-y-1">
                          <strong className="text-xs uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400">
                            No Outbox Payloads Found
                          </strong>
                          <p className="text-[11px] max-w-sm mx-auto text-slate-400 dark:text-slate-505 leading-relaxed">
                            No mock payloads found in workspace. Run a newsletter generation campaign with WordPress/Webhook enabled to populate mock payloads here.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {outboxPayloads.wordpress && (
                          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950">
                            <div className="bg-slate-100 dark:bg-slate-900 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center flex-wrap gap-2">
                              <span className="text-xs font-bold text-slate-750 dark:text-slate-250 flex items-center gap-1.5">
                                🌐 WordPress REST API Simulated Payload
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => dispatchOutboxPayload("wordpress")}
                                  disabled={isDispatching.wordpress}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {isDispatching.wordpress ? "Publishing..." : "🚀 Publish Live"}
                                </button>
                                <span className="text-[9px] font-mono text-emerald-500 font-bold">
                                  mock_wordpress_publish.json
                                </span>
                              </div>
                            </div>
                            <div className="p-4 overflow-x-auto max-h-[300px] text-[10.5px] font-mono text-slate-655 dark:text-slate-350 bg-white dark:bg-slate-950/40">
                              <pre>{JSON.stringify(outboxPayloads.wordpress, null, 2)}</pre>
                            </div>
                          </div>
                        )}

                        {outboxPayloads.webhook && (
                          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950">
                            <div className="bg-slate-100 dark:bg-slate-900 px-4 py-2.5 border-b border-slate-200 dark:border-slate-850 flex justify-between items-center flex-wrap gap-2">
                              <span className="text-xs font-bold text-slate-750 dark:text-slate-250 flex items-center gap-1.5">
                                🔗 Webhook Simulated Dispatch
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => dispatchOutboxPayload("webhook")}
                                  disabled={isDispatching.webhook}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {isDispatching.webhook ? "Triggering..." : "🚀 Trigger Webhook"}
                                </button>
                                <span className="text-[9px] font-mono text-emerald-500 font-bold">
                                  mock_webhook_publish.json
                                </span>
                              </div>
                            </div>
                            <div className="p-4 overflow-x-auto max-h-[300px] text-[10.5px] font-mono text-slate-655 dark:text-slate-350 bg-white dark:bg-slate-950/40">
                              <pre>{JSON.stringify(outboxPayloads.webhook, null, 2)}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
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
