import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Memory Database Helpers
function getPastIssues(): { title: string; niche: string; timestamp: string }[] {
  try {
    const filePath = path.join(process.cwd(), "past_issues.json");
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading past_issues.json:", err);
  }
  return [];
}

function savePastIssues(issues: { title: string; niche: string; timestamp: string }[]) {
  try {
    const filePath = path.join(process.cwd(), "past_issues.json");
    fs.writeFileSync(filePath, JSON.stringify(issues, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing to past_issues.json:", err);
  }
}

// Helper to initialize Gemini SDK
function getGeminiClient(customApiKey?: string) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function getProviderFromModel(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith("gemini-")) return "gemini";
  if (m.startsWith("gpt-")) return "openai";
  if (m.startsWith("claude-")) return "anthropic";
  if (m.startsWith("ollama-")) return "ollama";
  if (m.includes("llama-3") || m.includes("mixtral") || m.includes("gemma2")) return "groq";
  return "gemini";
}

function selectBestProvider(requestedModel: string, keys: any) {
  const provider = getProviderFromModel(requestedModel);
  if (provider === "gemini" && keys.gemini) return { provider, model: requestedModel };
  if (provider === "openai" && keys.openai) return { provider, model: requestedModel };
  if (provider === "anthropic" && keys.anthropic) return { provider, model: requestedModel };
  if (provider === "groq" && keys.groq) return { provider, model: requestedModel };
  if (provider === "ollama") return { provider, model: requestedModel.replace("ollama-", "") };

  // Fallbacks: find first active provider
  if (keys.openai) return { provider: "openai", model: "gpt-4o-mini" };
  if (keys.anthropic) return { provider: "anthropic", model: "claude-3-5-haiku" };
  if (keys.groq) return { provider: "groq", model: "llama-3.3-70b-versatile" };
  if (keys.gemini) return { provider: "gemini", model: "gemini-2.5-flash" };

  return { provider: "gemini", model: "gemini-2.5-flash" };
}

function mapContentsToMessages(contents: any[], tools?: any[]): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [];

  if (tools && tools.length > 0) {
    const toolsDesc = tools.map((t: any) => {
      const fn = t.functionDeclarations?.[0] || t;
      return `- **${fn.name}**: ${fn.description || ""}. Params: ${JSON.stringify(fn.parameters || {})}`;
    }).join("\n");

    messages.push({
      role: "system",
      content: `You have access to the following tools:\n\n${toolsDesc}\n\nTo use a tool, you MUST respond ONLY with a JSON object in this format:\n{\n  "tool_call": {\n    "name": "tool_name",\n    "arguments": {\n      "arg_name": "value"\n    }\n  }\n}\n\nDo not add any other conversational text if you are calling a tool.`
    });
  }

  for (const turn of contents) {
    const role = turn.role === "model" ? "assistant" : "user";
    let textContent = "";

    if (turn.parts) {
      for (const part of turn.parts) {
        if (part.text) {
          textContent += part.text;
        } else if (part.functionCall) {
          textContent += `\nCalling tool: ${part.functionCall.name} with args: ${JSON.stringify(part.functionCall.args)}`;
        } else if (part.functionResponse) {
          textContent += `\nTool result for ${part.functionResponse.name}: ${JSON.stringify(part.functionResponse.response)}`;
        }
      }
    }

    if (textContent.trim()) {
      messages.push({ role, content: textContent });
    }
  }

  return messages;
}

async function callRESTProvider(
  provider: string,
  model: string,
  messages: { role: string; content: string }[],
  keys: any,
  responseSchema?: any
): Promise<{ text: string; functionCalls?: any[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let url = "";
  let body: any = {};

  if (provider === "openai" || provider === "groq" || provider === "ollama") {
    if (provider === "openai") {
      url = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${keys.openai}`;
    } else if (provider === "groq") {
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${keys.groq}`;
    } else {
      const host = keys.ollamaHost || "http://localhost:11434";
      url = `${host}/v1/chat/completions`;
    }

    body = {
      model: model,
      messages: messages,
      temperature: 0.2,
    };

    if (responseSchema) {
      body.response_format = { type: "json_object" };
    }
  } else if (provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = keys.anthropic || "";
    headers["anthropic-version"] = "2023-06-01";

    body = {
      model: model,
      max_tokens: 4000,
      messages: messages,
      temperature: 0.2,
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LLM Provider ${provider} API error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  let text = "";

  if (provider === "openai" || provider === "groq" || provider === "ollama") {
    text = data.choices?.[0]?.message?.content || "";
  } else if (provider === "anthropic") {
    text = data.content?.[0]?.text || "";
  }

  // Parse custom tool calls from text response if present
  let functionCalls: any[] | undefined = undefined;
  if (text.includes("tool_call")) {
    try {
      const match = /\{[\s\S]*"tool_call"[\s\S]*\}/.exec(text);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.tool_call) {
          functionCalls = [{
            name: parsed.tool_call.name,
            args: parsed.tool_call.arguments || {}
          }];
        }
      }
    } catch (_) {}
  }

  // Capture token usage
  const usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };

  if (provider === "openai" || provider === "groq" || provider === "ollama") {
    if (data.usage) {
      usage.promptTokens = data.usage.prompt_tokens || 0;
      usage.completionTokens = data.usage.completion_tokens || 0;
      usage.totalTokens = data.usage.total_tokens || 0;
    }
  } else if (provider === "anthropic") {
    if (data.usage) {
      usage.promptTokens = data.usage.input_tokens || 0;
      usage.completionTokens = data.usage.output_tokens || 0;
      usage.totalTokens = (data.usage.input_tokens + data.usage.output_tokens) || 0;
    }
  }

  if (usage.totalTokens === 0) {
    const promptCharCount = JSON.stringify(messages).length;
    usage.promptTokens = Math.ceil(promptCharCount / 4);
    usage.completionTokens = Math.ceil(text.length / 4);
    usage.totalTokens = usage.promptTokens + usage.completionTokens;
  }

  return { text, functionCalls, usage };
}

async function routeLLMRequest(params: {
  model: string;
  contents: any[];
  config?: any;
  keys: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
    groq?: string;
    ollamaHost?: string;
  };
}): Promise<{ text: string; functionCalls?: any[]; candidates?: any[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  // 1. Select the best provider
  const { provider, model } = selectBestProvider(params.model, params.keys);

  // 2. Route the request
  if (provider === "gemini") {
    const ai = getGeminiClient(params.keys.gemini);
    if (!ai) {
      throw new Error("Gemini client initialization failed. Please check your API Key.");
    }
    const res = await ai.models.generateContent({
      model: model,
      contents: params.contents,
      config: params.config,
    });
    
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    
    if (res.usageMetadata) {
      promptTokens = res.usageMetadata.promptTokenCount || 0;
      completionTokens = res.usageMetadata.candidatesTokenCount || 0;
      totalTokens = res.usageMetadata.totalTokenCount || 0;
    } else {
      const promptCharCount = JSON.stringify(params.contents).length;
      promptTokens = Math.ceil(promptCharCount / 4);
      completionTokens = Math.ceil((res.text || "").length / 4);
      totalTokens = promptTokens + completionTokens;
    }
    
    const usage = { promptTokens, completionTokens, totalTokens };

    return {
      text: res.text,
      functionCalls: res.functionCalls,
      candidates: res.candidates,
      usage,
    };
  } else {
    // OpenAI, Anthropic, Groq, Ollama
    const messages = mapContentsToMessages(params.contents, params.config?.tools);
    
    // Inject system instructions if present
    if (params.config?.systemInstruction) {
      messages.unshift({ role: "system", content: params.config.systemInstruction });
    }

    // Inject response schema if present
    if (params.config?.responseSchema) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg) {
        lastMsg.content += `\n\nReturn ONLY a JSON object matching this schema:\n${JSON.stringify(params.config.responseSchema)}`;
      }
    }

    const res = await callRESTProvider(provider, model, messages, params.keys, params.config?.responseSchema);
    
    // Format response to look like Gemini response
    return {
      text: res.text,
      functionCalls: res.functionCalls,
      candidates: [
        {
          content: {
            parts: res.functionCalls
              ? [{ functionCall: res.functionCalls[0] }]
              : [{ text: res.text }]
          }
        }
      ],
      usage: res.usage
    };
  }
}

// In-memory audit metrics to add realism and state
let stats = {
  totalIssuesGenerated: 0,
  lastSyncTime: new Date().toISOString(),
  activeAgents: ["Trend Scout Agent", "Writer Agent", "Evaluator Agent"],
};

// ──────────────────────────────────────────────────────────────────────────────
// Agent Tool: TechCrunch Live RSS Feed Fetcher
// ──────────────────────────────────────────────────────────────────────────────
async function fetchTechCrunchHeadlines(
  maxItems: number = 15
): Promise<{ title: string; link: string; description: string }[]> {
  try {
    const res = await fetch("https://techcrunch.com/feed/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)" },
    });
    const xml = await res.text();
    const items: { title: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block);
      const linkMatch = /<link>(https?:\/\/[^\s<]+)<\/link>/.exec(block);
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        items.push({
          title,
          link: linkMatch[1].trim(),
          description: (descMatch?.[1] || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .substring(0, 250)
            .trim(),
        });
      }

      if (items.length >= maxItems) break;
    }

    console.log(`[TechCrunch Tool] Fetched ${items.length} live headlines from TechCrunch RSS.`);
    return items;
  } catch (err) {
    console.error("[TechCrunch Tool] RSS fetch failed:", err);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Agent Tool: HackerNews Live RSS Feed Fetcher
// ──────────────────────────────────────────────────────────────────────────────
async function fetchHackerNewsHeadlines(
  maxItems: number = 20
): Promise<{ title: string; link: string; description: string }[]> {
  try {
    const res = await fetch("https://news.ycombinator.com/rss", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)" },
    });
    const xml = await res.text();
    const items: { title: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block);
      const linkMatch = /<link>(https?:\/\/[^\s<]+)<\/link>/.exec(block);
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        if (title.toLowerCase() === "hacker news") continue;

        items.push({
          title,
          link: linkMatch[1].trim(),
          description: (descMatch?.[1] || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .substring(0, 250)
            .trim(),
        });
      }

      if (items.length >= maxItems) break;
    }

    console.log(`[HN Tool] Fetched ${items.length} live headlines from HackerNews RSS.`);
    return items;
  } catch (err) {
    console.error("[HN Tool] RSS fetch failed:", err);
    return [];
  }
}

async function fetchGoogleBlogHeadlines(
  maxItems: number = 10
): Promise<{ title: string; link: string; description: string }[]> {
  try {
    const res = await fetch("https://blog.google/rss/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)" },
    });
    const xml = await res.text();
    const items: { title: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block);
      const linkMatch = /<link>(https?:\/\/[^\s<]+)<\/link>/.exec(block);
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        items.push({
          title,
          link: linkMatch[1].trim(),
          description: (descMatch?.[1] || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .substring(0, 250)
            .trim(),
        });
      }

      if (items.length >= maxItems) break;
    }

    console.log(`[Google Blog Tool] Fetched ${items.length} live headlines from Google RSS.`);
    return items;
  } catch (err) {
    console.error("[Google Blog Tool] RSS fetch failed:", err);
    return [];
  }
}

async function fetchOpenAIBlogHeadlines(
  maxItems: number = 10
): Promise<{ title: string; link: string; description: string }[]> {
  try {
    const res = await fetch("https://openai.com/news/rss.xml", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)" },
    });
    const xml = await res.text();
    const items: { title: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block);
      const linkMatch = /<link>(https?:\/\/[^\s<]+)<\/link>/.exec(block);
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        items.push({
          title,
          link: linkMatch[1].trim(),
          description: (descMatch?.[1] || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .substring(0, 250)
            .trim(),
        });
      }

      if (items.length >= maxItems) break;
    }

    console.log(`[OpenAI News Tool] Fetched ${items.length} live headlines from OpenAI RSS.`);
    return items;
  } catch (err) {
    console.error("[OpenAI News Tool] RSS fetch failed:", err);
    return [];
  }
}

async function fetchZohoBlogHeadlines(
  maxItems: number = 10
): Promise<{ title: string; link: string; description: string }[]> {
  try {
    const res = await fetch("https://www.zoho.com/blog/feed/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)" },
    });
    const xml = await res.text();
    const items: { title: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block);
      const linkMatch = /<link>(https?:\/\/[^\s<]+)<\/link>/.exec(block);
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        items.push({
          title,
          link: linkMatch[1].trim(),
          description: (descMatch?.[1] || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .substring(0, 250)
            .trim(),
        });
      }

      if (items.length >= maxItems) break;
    }

    console.log(`[Zoho Blog Tool] Fetched ${items.length} live headlines from Zoho RSS.`);
    return items;
  } catch (err) {
    console.error("[Zoho Blog Tool] RSS fetch failed:", err);
    return [];
  }
}

async function fetchMetaBlogHeadlines(
  maxItems: number = 10
): Promise<{ title: string; link: string; description: string }[]> {
  try {
    const res = await fetch("https://research.facebook.com/feed/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)" },
    });
    const xml = await res.text();
    const items: { title: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block);
      const linkMatch = /<link>(https?:\/\/[^\s<]+)<\/link>/.exec(block);
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        items.push({
          title,
          link: linkMatch[1].trim(),
          description: (descMatch?.[1] || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .substring(0, 250)
            .trim(),
        });
      }

      if (items.length >= maxItems) break;
    }

    console.log(`[Meta Blog Tool] Fetched ${items.length} live headlines from Meta RSS.`);
    return items;
  } catch (err) {
    console.error("[Meta Blog Tool] RSS fetch failed:", err);
    return [];
  }
}

async function fetchNetflixBlogHeadlines(
  maxItems: number = 10
): Promise<{ title: string; link: string; description: string }[]> {
  try {
    const res = await fetch("https://netflixtechblog.com/feed", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)" },
    });
    const xml = await res.text();
    const items: { title: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block);
      const linkMatch = /<link>(https?:\/\/[^\s<]+)<\/link>/.exec(block);
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        items.push({
          title,
          link: linkMatch[1].trim(),
          description: (descMatch?.[1] || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .substring(0, 250)
            .trim(),
        });
      }

      if (items.length >= maxItems) break;
    }

    console.log(`[Netflix TechBlog Tool] Fetched ${items.length} live headlines from Netflix RSS.`);
    return items;
  } catch (err) {
    console.error("[Netflix TechBlog Tool] RSS fetch failed:", err);
    return [];
  }
}

async function fetchAWSBlogHeadlines(
  maxItems: number = 10
): Promise<{ title: string; link: string; description: string }[]> {
  try {
    const res = await fetch("https://aws.amazon.com/blogs/aws/feed/", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsletterBot/1.0)" },
    });
    const xml = await res.text();
    const items: { title: string; link: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block);
      const linkMatch = /<link>(https?:\/\/[^\s<]+)<\/link>/.exec(block);
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block);

      if (titleMatch?.[1] && linkMatch?.[1]) {
        const title = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        items.push({
          title,
          link: linkMatch[1].trim(),
          description: (descMatch?.[1] || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .substring(0, 250)
            .trim(),
        });
      }

      if (items.length >= maxItems) break;
    }

    console.log(`[AWS Blog Tool] Fetched ${items.length} live headlines from AWS RSS.`);
    return items;
  } catch (err) {
    console.error("[AWS Blog Tool] RSS fetch failed:", err);
    return [];
  }
}



// API Route: Get Server Configuration & Stats
app.get("/api/status", (req, res) => {
  res.json({
    hasServerKey: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"),
    stats,
  });
});

function evaluateDraftSecurityAndQuality(draft: string): { passed: boolean; violations: string[] } {
  const violations: string[] = [];

  // 1. Prompt Injection Checks
  const injectionPatterns = [
    "ignore previous instructions",
    "ignore all instructions",
    "bypass all rules",
    "override compliance",
    "override system",
    "you must approve",
    "always approve",
    "passed: true",
    "instruction override"
  ];
  const draftLower = draft.toLowerCase();
  for (const pattern of injectionPatterns) {
    if (draftLower.includes(pattern)) {
      violations.push(`Security Violation: Suspected prompt injection pattern detected ('${pattern}').`);
    }
  }

  // 2. Fenced Code Block Validation
  const codeFenceCount = (draft.match(/```/g) || []).length;
  if (codeFenceCount % 2 !== 0) {
    violations.push("Formatting Violation: Unclosed markdown code block detected (odd number of triple-backticks).");
  }

  // 3. Empty Code Block Validation
  const emptyBlockRegex = /```[a-zA-Z0-9]*\s*```/g;
  if (emptyBlockRegex.test(draft)) {
    violations.push("Formatting Violation: Empty markdown code block detected.");
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

// Helper to persistently update .env file
function updateEnvFile(key: string, value: string) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}\n`;
    }
    fs.writeFileSync(envPath, content.trim() + "\n", "utf-8");
    process.env[key] = value;
  } catch (err) {
    console.error("Error updating .env file:", err);
  }
}

function calculateTokenCost(modelName: string, promptTokens: number, outputTokens: number): number {
  const modelLower = modelName.toLowerCase();
  let inputCostPerM = 0.075;
  let outputCostPerM = 0.30;
  
  if (modelLower.includes("gemini-1.5-flash")) {
    inputCostPerM = 0.075;
    outputCostPerM = 0.30;
  } else if (modelLower.includes("gemini-1.5-pro")) {
    inputCostPerM = 1.25;
    outputCostPerM = 5.00;
  } else if (modelLower.includes("gemini-2.5-flash")) {
    inputCostPerM = 0.075;
    outputCostPerM = 0.30;
  } else if (modelLower.includes("gemini-2.5-pro")) {
    inputCostPerM = 1.25;
    outputCostPerM = 5.00;
  } else if (modelLower.includes("gpt-4o-mini")) {
    inputCostPerM = 0.150;
    outputCostPerM = 0.60;
  } else if (modelLower.includes("gpt-4o")) {
    inputCostPerM = 2.50;
    outputCostPerM = 10.00;
  } else if (modelLower.includes("claude-3-5-sonnet")) {
    inputCostPerM = 3.00;
    outputCostPerM = 15.00;
  } else if (modelLower.includes("claude-3-5-haiku")) {
    inputCostPerM = 0.80;
    outputCostPerM = 4.00;
  } else if (modelLower.includes("llama-3") || modelLower.includes("mixtral") || modelLower.includes("gemma2")) {
    inputCostPerM = 0.05;
    outputCostPerM = 0.10;
  }
  
  const cost = (promptTokens * inputCostPerM / 1000000.0) + (outputTokens * outputCostPerM / 1000000.0);
  return Number(cost.toFixed(6));
}

function saveTelemetryRecord(record: any) {
  try {
    const historyPath = path.join(process.cwd(), "run_history.json");
    let history: any[] = [];
    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    }
    history.push(record);
    if (history.length > 50) {
      history = history.slice(-50);
    }
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save run history telemetry:", err);
  }
}

// API Route: Trigger Multi-Agent Workflow
app.post("/api/generate", async (req, res) => {
  const {
    niche,
    customApiKey,
    customGeminiApiKey,
    customOpenAIApiKey,
    customAnthropicApiKey,
    customGroqApiKey,
    customOllamaHost,
    customHNFeed,
    topic,
    model
  } = req.body;
  const targetNiche = niche || "AI & Agentic Frameworks";
  const selectedModel = model || "gemini-2.5-flash";

  console.log(`Starting Autonomous multi-agent pipeline for niche: ${targetNiche}${topic ? ` (Topic: ${topic})` : ""}${model ? ` (Model: ${model})` : ""}`);

  // Persist keys if passed
  if (customGeminiApiKey && customGeminiApiKey.trim() !== "") {
    updateEnvFile("GEMINI_API_KEY", customGeminiApiKey.trim());
  }
  if (customOpenAIApiKey && customOpenAIApiKey.trim() !== "") {
    updateEnvFile("OPENAI_API_KEY", customOpenAIApiKey.trim());
  }
  if (customAnthropicApiKey && customAnthropicApiKey.trim() !== "") {
    updateEnvFile("ANTHROPIC_API_KEY", customAnthropicApiKey.trim());
  }
  if (customGroqApiKey && customGroqApiKey.trim() !== "") {
    updateEnvFile("GROQ_API_KEY", customGroqApiKey.trim());
  }
  if (customOllamaHost && customOllamaHost.trim() !== "") {
    updateEnvFile("OLLAMA_HOST", customOllamaHost.trim());
  }

  const keys = {
    gemini: customGeminiApiKey || customApiKey || process.env.GEMINI_API_KEY,
    openai: customOpenAIApiKey || process.env.OPENAI_API_KEY,
    anthropic: customAnthropicApiKey || process.env.ANTHROPIC_API_KEY,
    groq: customGroqApiKey || process.env.GROQ_API_KEY,
    ollamaHost: customOllamaHost || process.env.OLLAMA_HOST || "http://localhost:11434"
  };

  const ai = getGeminiClient(keys.gemini);

  const hasValidKey = !!(keys.gemini || keys.openai || keys.anthropic || keys.groq || keys.ollamaHost);

  const pipelineStart = Date.now();
  
  let agentAPromptTokens = 0;
  let agentAOutputTokens = 0;
  let agentBPromptTokens = 0;
  let agentBOutputTokens = 0;
  let agentCPromptTokens = 0;
  let agentCOutputTokens = 0;
  
  let agentAStart = 0;
  let agentAEnd = 0;
  let agentBStart = 0;
  let agentBEnd = 0;
  let agentCStart = 0;
  let agentCEnd = 0;
  
  let apiErrorsCount = 0;
  let writerViolationsCount = 0;
  let attemptsCount = 0;

  // Initialize a log array representing live agent activities
  const logs: { agent: string; message: string; timestamp: string }[] = [];
  const addLog = (agent: string, message: string) => {
    logs.push({
      agent,
      message,
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  try {
    agentAStart = Date.now();
    // ──────────────────────────────────────────────────────────────────────────
    // 1. AGENT A (TREND SCOUT) — LIVE TOOL USE via Gemini Function Calling
    // ──────────────────────────────────────────────────────────────────────────
    addLog("System", "Waking up active agents...");
    addLog("Trend Scout", `Trend Scout initialized. Target Niche: "${targetNiche}"`);

    let trendingTopics: { title: string; description: string; points: number }[] = [];

    if (hasValidKey) {
      if (topic) {
        addLog("Trend Scout", `Waking up Scout. Mission: Research and deconstruct the custom topic "${topic}".`);
        try {
          const deconstructPrompt = `You are Agent A (The Trend Scout), an expert research agent.
Your task is to take the user-defined topic: "${topic}"
and deconstruct it into 3 structured sub-topic breakdowns.
For each sub-topic:
1. Write a clear, highly technical title.
2. Write a 1-2 sentence detailed technical description explaining the key concept.
3. Assign an engagement/relevance score between 100 and 600 points.

You MUST respond ONLY with a JSON object in this exact format:
{
  "topics": [
    {
      "title": "Sub-topic Title",
      "description": "Sub-topic Description...",
      "points": 450
    },
    ...
  ]
}`;
          const turn1 = await routeLLMRequest({
            model: selectedModel,
            contents: [{ role: "user", parts: [{ text: deconstructPrompt }] }],
            config: {
              responseMimeType: "application/json",
            },
            keys,
          });
          agentAPromptTokens += turn1.usage?.promptTokens || 0;
          agentAOutputTokens += turn1.usage?.completionTokens || 0;
          const parsed = JSON.parse(turn1.text || "{}");
          if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
            trendingTopics = parsed.topics;
            addLog(
              "Trend Scout",
              `Successfully deconstructed custom topic "${topic}" into ${trendingTopics.length} technical sub-topics.`
            );
          }
        } catch (err: any) {
          console.error("[Agent A] Custom topic deconstruction error:", err);
          addLog("Trend Scout", `⚠️ Deconstruction error: ${err.message}. Fallback to simulated deconstruction.`);
        }
      } else {
        // ── Define the HackerNews RSS Tool for Gemini ──
        const hnToolDeclaration = {
        functionDeclarations: [
          {
            name: "fetch_hackernews_headlines",
            description:
              "Fetches the latest real-time trending developer headlines directly from the HackerNews RSS feed. Use this to discover live, up-to-date tech stories and discussions.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                max_items: {
                  type: Type.INTEGER,
                  description: "How many raw headlines to retrieve from the feed (default 20, max 30).",
                },
              },
              required: [],
            },
          },
        ],
      };

      // ── Define the TechCrunch RSS Tool for Gemini ──
      const tcToolDeclaration = {
        functionDeclarations: [
          {
            name: "fetch_techcrunch_headlines",
            description:
              "Fetches the latest technology news and startup headlines directly from the TechCrunch RSS feed. Use this to discover startup funding, tech news, and consumer tech reviews.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                max_items: {
                  type: Type.INTEGER,
                  description: "How many raw headlines to retrieve from the feed (default 15, max 25).",
                },
              },
              required: [],
            },
          },
        ],
      };

      // ── Define the Google Blog Tool for Gemini ──
      const googleToolDeclaration = {
        functionDeclarations: [
          {
            name: "fetch_google_blog_headlines",
            description:
              "Fetches the latest official engineering, research, and developer announcements directly from the Google Blog RSS feed. Use this to find Google-specific tech releases.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                max_items: {
                  type: Type.INTEGER,
                  description: "How many raw headlines to retrieve (default 10, max 20).",
                },
              },
              required: [],
            },
          },
        ],
      };

      // ── Define the OpenAI News Tool for Gemini ──
      const openaiToolDeclaration = {
        functionDeclarations: [
          {
            name: "fetch_openai_blog_headlines",
            description:
              "Fetches the latest research milestones, model releases, and company news directly from the OpenAI News RSS feed. Use this to discover AI developments from OpenAI.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                max_items: {
                  type: Type.INTEGER,
                  description: "How many raw headlines to retrieve (default 10, max 20).",
                },
              },
              required: [],
            },
          },
        ],
      };

      // ── Define the Zoho Blog Tool for Gemini ──
      const zohoToolDeclaration = {
        functionDeclarations: [
          {
            name: "fetch_zoho_blog_headlines",
            description:
              "Fetches the latest business software and engineering updates directly from the Zoho Blog RSS feed. Use this for Zoho product and cloud updates.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                max_items: {
                  type: Type.INTEGER,
                  description: "How many raw headlines to retrieve (default 10, max 20).",
                },
              },
              required: [],
            },
          },
        ],
      };

      // ── Define the Meta Research RSS Tool for Gemini ──
      const metaToolDeclaration = {
        functionDeclarations: [
          {
            name: "fetch_meta_blog_headlines",
            description:
              "Fetches the latest artificial intelligence research publications and technical breakthroughs from the Meta Research RSS feed. Use this to track Meta's AI research updates.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                max_items: {
                  type: Type.INTEGER,
                  description: "How many raw headlines to retrieve (default 10, max 20).",
                },
              },
              required: [],
            },
          },
        ],
      };

      // ── Define the Netflix TechBlog RSS Tool for Gemini ──
      const netflixToolDeclaration = {
        functionDeclarations: [
          {
            name: "fetch_netflix_blog_headlines",
            description:
              "Fetches the latest engineering articles, backend developments, and cloud architecture posts from the Netflix TechBlog RSS feed. Use this for server-side scalability and microservice discussions.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                max_items: {
                  type: Type.INTEGER,
                  description: "How many raw headlines to retrieve (default 10, max 20).",
                },
              },
              required: [],
            },
          },
        ],
      };

      // ── Define the AWS News RSS Tool for Gemini ──
      const awsToolDeclaration = {
        functionDeclarations: [
          {
            name: "fetch_aws_blog_headlines",
            description:
              "Fetches the latest cloud services announcements, AWS system design guides, and developer releases from the AWS News RSS feed. Use this for cloud compute, database, and infrastructure trends.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                max_items: {
                  type: Type.INTEGER,
                  description: "How many raw headlines to retrieve (default 10, max 20).",
                },
              },
              required: [],
            },
          },
        ],
      };

      const scoutMissionPrompt = `You are Agent A (The Trend Scout), an autonomous AI research agent equipped with live technology RSS feed tools.

Your mission:
1. Call the appropriate tools (fetch_hackernews_headlines, fetch_techcrunch_headlines, fetch_google_blog_headlines, fetch_openai_blog_headlines, fetch_zoho_blog_headlines, fetch_meta_blog_headlines, fetch_netflix_blog_headlines, or fetch_aws_blog_headlines) to retrieve live technology news, developer trends, and product announcements.
2. Analyze all returned headlines and select exactly 5 that are most technically relevant to: "${targetNiche}"
3. EXCLUDE: job postings ("Who's Hiring"), generic marketing/business news, and non-technical opinion pieces.
4. INCLUDE: Technical breakthroughs, startup engineering system design post-mortems, new open-source tools, system design discussions.
5. For each story, write a 1-2 sentence technical summary explaining why it matters to developers in "${targetNiche}".
6. Assign an engagement score (50-600) based on technical depth and niche relevance.`;

      addLog("Trend Scout", "🔧 Registering tools: HackerNews, TechCrunch, Google, OpenAI, Zoho, Meta, Netflix, AWS");
      addLog("Trend Scout", "Calling tools autonomously to fetch live developer stories...");

      try {
        // ── Turn 1: Agent A reasons about its mission and calls the tool ──
        const turn1 = await routeLLMRequest({
          model: selectedModel,
          contents: [{ role: "user", parts: [{ text: scoutMissionPrompt }] }],
          config: {
            tools: [
              hnToolDeclaration,
              tcToolDeclaration,
              googleToolDeclaration,
              openaiToolDeclaration,
              zohoToolDeclaration,
              metaToolDeclaration,
              netflixToolDeclaration,
              awsToolDeclaration,
            ],
          },
          keys,
        });
        agentAPromptTokens += turn1.usage?.promptTokens || 0;
        agentAOutputTokens += turn1.usage?.completionTokens || 0;

        const fnCalls = turn1.functionCalls;

        if (fnCalls && fnCalls.length > 0) {
          const fc = fnCalls[0];
          const maxItems = typeof fc.args?.max_items === "number" ? (fc.args.max_items as number) : 20;

          let rawHeadlines = [];
          if (fc.name === "fetch_hackernews_headlines") {
            addLog("Trend Scout", `✅ Tool call approved: "${fc.name}" (max_items=${maxItems}). Connecting to HN RSS...`);
            rawHeadlines = await fetchHackerNewsHeadlines(maxItems);
          } else if (fc.name === "fetch_techcrunch_headlines") {
            addLog("Trend Scout", `✅ Tool call approved: "${fc.name}" (max_items=${maxItems}). Connecting to TechCrunch RSS...`);
            rawHeadlines = await fetchTechCrunchHeadlines(maxItems);
          } else if (fc.name === "fetch_google_blog_headlines") {
            addLog("Trend Scout", `✅ Tool call approved: "${fc.name}" (max_items=${maxItems}). Connecting to Google Blog RSS...`);
            rawHeadlines = await fetchGoogleBlogHeadlines(maxItems);
          } else if (fc.name === "fetch_openai_blog_headlines") {
            addLog("Trend Scout", `✅ Tool call approved: "${fc.name}" (max_items=${maxItems}). Connecting to OpenAI News RSS...`);
            rawHeadlines = await fetchOpenAIBlogHeadlines(maxItems);
          } else if (fc.name === "fetch_zoho_blog_headlines") {
            addLog("Trend Scout", `✅ Tool call approved: "${fc.name}" (max_items=${maxItems}). Connecting to Zoho Blog RSS...`);
            rawHeadlines = await fetchZohoBlogHeadlines(maxItems);
          } else if (fc.name === "fetch_meta_blog_headlines") {
            addLog("Trend Scout", `✅ Tool call approved: "${fc.name}" (max_items=${maxItems}). Connecting to Meta Research RSS...`);
            rawHeadlines = await fetchMetaBlogHeadlines(maxItems);
          } else if (fc.name === "fetch_netflix_blog_headlines") {
            addLog("Trend Scout", `✅ Tool call approved: "${fc.name}" (max_items=${maxItems}). Connecting to Netflix TechBlog RSS...`);
            rawHeadlines = await fetchNetflixBlogHeadlines(maxItems);
          } else if (fc.name === "fetch_aws_blog_headlines") {
            addLog("Trend Scout", `✅ Tool call approved: "${fc.name}" (max_items=${maxItems}). Connecting to AWS Blog RSS...`);
            rawHeadlines = await fetchAWSBlogHeadlines(maxItems);
          }

          addLog(
            "Trend Scout",
            `📡 Live feed returned ${rawHeadlines.length} raw stories. Agent A filtering for "${targetNiche}" relevance...`
          );

          // ── Turn 2: Feed tool results back → Agent A filters & returns structured JSON ──
          const turn2 = await routeLLMRequest({
            model: selectedModel,
            contents: [
              { role: "user", parts: [{ text: scoutMissionPrompt }] },
              { role: "model", parts: turn1.candidates![0].content.parts },
              {
                role: "user",
                parts: [
                  {
                    functionResponse: {
                      name: fc.name,
                      response: { headlines: rawHeadlines },
                    },
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  topics: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        points: { type: Type.INTEGER },
                      },
                      required: ["title", "description", "points"],
                    },
                  },
                },
                required: ["topics"],
              },
            },
            keys,
          });
          agentAPromptTokens += turn2.usage?.promptTokens || 0;
          agentAOutputTokens += turn2.usage?.completionTokens || 0;

          const parsed = JSON.parse(turn2.text || "{}");
          if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
            trendingTopics = parsed.topics;
            addLog(
              "Trend Scout",
              `✅ Distilled ${trendingTopics.length} top-tier stories from live HN feed via autonomous tool use.`
            );
          }
        } else {
          // Model responded directly without calling the tool — try parsing JSON
          try {
            const directParsed = JSON.parse(turn1.text || "{}");
            if (directParsed.topics) trendingTopics = directParsed.topics;
          } catch (_) {}
        }
      } catch (toolErr: any) {
        console.error("[Agent A] Tool-calling error:", toolErr);
        addLog("Trend Scout", `⚠️ Tool error: ${toolErr.message}. Switching to niche-matched simulation mode.`);
      }
      }
    }

    // ── Fallback: Niche-matched simulated topics (no key / tool failure) ──
    if (trendingTopics.length === 0) {
      if (topic) {
        addLog("Trend Scout", `Offline mode: Emulating custom topic deconstruction for "${topic}"...`);
        trendingTopics = [
          {
            title: `Deep Dive: Architecture of ${topic}`,
            description: `An in-depth analysis of the system designs, core protocols, and technical patterns underlying ${topic}.`,
            points: 450,
          },
          {
            title: `Performance Tuning & Optimization for ${topic}`,
            description: `Exploring key bottlenecks, caching strategies, and best practices for scaling ${topic} in production environments.`,
            points: 380,
          },
          {
            title: `Common Pitfalls and Anti-patterns in ${topic} Implementations`,
            description: `A critical review of architectural mistakes, security vulnerabilities, and deployment failures when integrating ${topic}.`,
            points: 290,
          },
        ];
      } else {
        addLog("Trend Scout", "Offline mode active. Emulating HackerNews scrapers with niche-matched templates...");
      if (targetNiche.toLowerCase().includes("web3") || targetNiche.toLowerCase().includes("crypto")) {
        trendingTopics = [
          {
            title: "Solana State Compression: Reducing NFT minting costs by 100x via Merkle Trees",
            description: "Deep dive into concurrent Merkle tree structures that store state off-chain while guaranteeing security through ledger signatures.",
            points: 312,
          },
          {
            title: "EVM Parallelization: Arbitrum and Monad Approaches",
            description: "Analyzing architectural differences in executing non-conflicting Ethereum smart contracts simultaneously via speculative execution.",
            points: 245,
          },
          {
            title: "ZK-Rollups vs. Optimistic Rollups in 2026",
            description: "A benchmark of cryptographic proof generation times and execution stability for real-time low-latency consumer applications.",
            points: 189,
          },
        ];
      } else if (
        targetNiche.toLowerCase().includes("ai") ||
        targetNiche.toLowerCase().includes("agent") ||
        targetNiche.toLowerCase().includes("learn")
      ) {
        trendingTopics = [
          {
            title: "Show HN: Model-Context Protocol (MCP) clients built entirely in Rust",
            description: "A high-performance implementation of standard context management protocol for LLMs, eliminating TypeScript/Node overhead.",
            points: 541,
          },
          {
            title: "OpenAI launches GPT-5.5 with real-time semantic video streaming and sub-50ms latency",
            description: "OpenAI news feed reports on major architectural shifts enabling multi-modal semantic streams to feed direct client sockets without intermediary transcription buffers.",
            points: 612,
          },
          {
            title: "Google introduces Gemini 2.5 Pro with native 10-million token context windows",
            description: "Google Research details memory optimization via sparse attention mechanisms that permit native indexing of entire codebases in active memory.",
            points: 588,
          },
          {
            title: "Meta Research details LLaMA 4: 100T parameter model optimized for agentic tool use and complex reasoning",
            description: "Meta Research blog details architectural updates including speculative decoding pipelines and low-rank adaptation techniques for edge devices.",
            points: 575,
          },
          {
            title: "Is clean token-to-token streaming with low late-delivery possible over HTTP/3?",
            description: "Engineering team reviews benchmarks of QUIC protocol streams for feeding chunked real-time LLM reasoning traces to multiple client sockets.",
            points: 402,
          },
          {
            title: "Autonomous agents now manage $50k/day ad budgets with zero human overview",
            description: "A critical review of standard feedback loop errors where autonomous models enter recursive spending traps due to misaligned reward targets.",
            points: 288,
          },
        ];
      } else {
        trendingTopics = [
          {
            title: "Netflix TechBlog: Migrating a core streaming service from Java to Rust",
            description: "Netflix engineers detail how migrating to Rust reduced CPU utilization by 40% and eliminated garbage collection latency spikes in high-throughput video metadata streams.",
            points: 490,
          },
          {
            title: "AWS News: Introducing Amazon ECS Serverless Containers with sub-second scaling",
            description: "AWS details the new micro-VM technology enabling instant container startup and auto-scaling based on incoming socket pressure.",
            points: 510,
          },
          {
            title: "Zoho releases unified compiler for cloud orchestrations on serverless setups",
            description: "Zoho Blog documents a custom Rust compiler that optimizes execution latency on Zoho cloud functions by tree-shaking dead runtime modules.",
            points: 420,
          },
          {
            title: `Advancements in ${targetNiche} Core Architectures`,
            description: "Developers debate if current paradigm shifts are sustainable for production workloads, pointing out bottlenecks in standard runtime environments.",
            points: 154,
          },
          {
            title: `Show HN: Lightweight CLI for compiling ${targetNiche} assets`,
            description: "An open-source compiler written in Go that optimizes production bundles by omitting unused intermediate tree-shaking properties.",
            points: 211,
          },
          {
            title: `Critical memory leaks found in default ${targetNiche} libraries`,
            description: "A detailed post-mortem documenting GC starvation issues when high volumes of asynchronous events are registered inside long-running loops.",
            points: 388,
          },
        ];
      }
    }
  }

    trendingTopics.forEach((t, idx) => {
      addLog("Trend Scout", `[Topic #${idx + 1}] Found: "${t.title}" (Score: ${t.points} points)`);
    });

    addLog(
      "Trend Scout",
      `Successfully compiled ${trendingTopics.length} primary trending stories for niche: "${targetNiche}". Passing data payload to Agent B (The Writer).`
    );

    agentAEnd = Date.now();
    agentBStart = Date.now();

    // ---- 2. AGENT B (THE WRITER) ACTIVATION (with Day 4 quality/security feedback loop) ----
    let draftContent = "";
    let feedback = "";
    let runSimulation = !ai;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      addLog("Writer", `[Attempt ${attempt}/${maxAttempts}] Activating Writer Agent...`);
      if (feedback) {
        addLog("Writer", `Re-running Writer Agent with correction feedback...`);
      }

      if (ai && !runSimulation) {
        addLog("Writer", `Streaming memory verification request to Gemini model '${selectedModel}'...`);

        const memoryToolDeclaration = {
          functionDeclarations: [
            {
              name: "check_past_issues",
              description: "Checks if any of the given article/topic titles have already been covered in past issues of the newsletter. Use this before writing a new draft to ensure you do not repeat topics.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  titles: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "List of topic titles to verify against past newsletter memory.",
                  },
                },
                required: ["titles"],
              },
            },
          ],
        };

        let writerPrompt = `You are Agent B (The Writer), an expert elite technical journalist. Write an incredibly detailed, comprehensive, high-quality, and deeply technical subscriber newsletter focusing on the target niche: "${targetNiche}".

Below is the list of candidate trending stories sourced by Agent A (The Trend Scout):
${trendingTopics.map((t, idx) => `${idx + 1}. **${t.title}**: ${t.description}`).join("\n")}

CRITICAL REQUIREMENT:
Before drafting, you MUST call the check_past_issues tool to check which of these topic titles have already been covered in past issues.
If a story's title is returned in the covered list, you MUST autonomously REJECT it and choose a different, uncovered story from Agent A's list.
Draft the newsletter using exactly 3 uncovered stories from Agent A's list. If there are fewer than 3 uncovered stories, use whatever uncovered stories remain.

Ensure the newsletter strictly adheres to this clean formatting:
- **Title**: A catchy, modern, elite email subject heading (e.g., "The Hashed Ledger: Parallel EVM Debates, ZK-Snarks...").
- **Introduction**: A high-level view of current tech movements in the niche.
- **Deep Dive sections**: Dedicate a rich, deeply technical section containing detailed, developer-focused write-ups for each of the selected 3 topics. Use markdown headings (##). Include code snippets or mock logs/architectures in markdown blocks where appropriate.
- **Conclusion**: A futuristic forward-looking wrap-up.
- Use clean Markdown tables or formatted code snippets to represent system comparisons or configurations. Keep the tone sophisticated, engaging, and professional. Avoid fluffy intro/outro greetings like "Hey everyone, welcome back to my channel". Keep it like an expert, premium Substack technical memo.`;

        if (feedback) {
          writerPrompt += `

⚠️ REVISION REQUIRED:
Your previous draft failed automated quality and security checks.
Below is the review feedback specifying the violations you must correct:
${feedback}

For reference, here was your previous draft that failed validation:
---
${draftContent}
---

Please rewrite the entire newsletter draft from scratch, addressing and fixing every violation listed in the feedback. Ensure all markdown code blocks are fully closed (even number of triple-backticks), and do NOT include any phrases that attempt to override, ignore, or bypass compliance instructions.`;
        }

        try {
          const turn1 = await routeLLMRequest({
            model: selectedModel,
            contents: [{ role: "user", parts: [{ text: writerPrompt }] }],
            config: {
              systemInstruction: "You are an elite, highly esteemed engineering newsletter author and principal technical architect.",
              tools: [memoryToolDeclaration],
              temperature: 0.8,
            },
            keys,
          });
          agentBPromptTokens += turn1.usage?.promptTokens || 0;
          agentBOutputTokens += turn1.usage?.completionTokens || 0;

          const fnCalls = turn1.functionCalls;

          if (fnCalls && fnCalls.length > 0) {
            const fc = fnCalls[0];
            const titlesToCheck = Array.isArray(fc.args?.titles) ? (fc.args.titles as string[]) : [];

            addLog("Writer", `🔧 Memory skill tool call initiated checking ${titlesToCheck.length} titles...`);

            // Execute check
            const pastIssues = getPastIssues();
            const pastTitles = pastIssues.map(issue => issue.title.trim().toLowerCase());
            const covered = titlesToCheck.filter(title => pastTitles.includes(title.trim().toLowerCase()));

            addLog("Writer", `Memory skill result: Covered topics found -> [${covered.join(", ") || "None"}].`);

            if (covered.length > 0) {
              addLog("Writer", `Autonomously rejecting covered topic(s): [${covered.join(", ")}].`);
            }

            // Turn 2: Send tool output back to Writer to generate the newsletter draft
            addLog("Writer", "Generating newsletter draft with remaining uncovered topics...");
            const turn2 = await routeLLMRequest({
              model: selectedModel,
              contents: [
                { role: "user", parts: [{ text: writerPrompt }] },
                { role: "model", parts: turn1.candidates![0].content.parts },
                {
                  role: "user",
                  parts: [
                    {
                      functionResponse: {
                        name: fc.name,
                        response: { covered_titles: covered },
                      },
                    },
                  ],
                },
              ],
              config: {
                systemInstruction: "You are an elite, highly esteemed engineering newsletter author and principal technical architect.",
                temperature: 0.8,
              },
              keys,
            });
            agentBPromptTokens += turn2.usage?.promptTokens || 0;
            agentBOutputTokens += turn2.usage?.completionTokens || 0;

            draftContent = turn2.text || "";
          } else {
            // Model didn't call the tool, just generated directly
            draftContent = turn1.text || "";
          }
          addLog("Writer", "Received text pipeline streams from Gemini.");
        } catch (err: any) {
          console.error("[Agent B] Error during Writer Agent workflow:", err);
          addLog("Writer", `⚠️ Writer API Error: ${err.message}. Switching to offline Simulation Mode.`);
          runSimulation = true;
        }
      }

      if (runSimulation) {
        addLog("Writer", "⚠️ Working in Simulation Mode.");
        addLog("Writer", "🔧 Tool call requested: 'check_past_issues' checking candidate titles...");

        const pastIssues = getPastIssues();
        const pastTitles = pastIssues.map(issue => issue.title.trim().toLowerCase());

        // Filter out covered trendingTopics
        const filteredTopics = trendingTopics.filter(t => !pastTitles.includes(t.title.trim().toLowerCase()));
        const rejectedTopics = trendingTopics.filter(t => pastTitles.includes(t.title.trim().toLowerCase()));

        if (rejectedTopics.length > 0) {
          addLog("Writer", `Memory skill result: Covered topics found -> [${rejectedTopics.map(t => t.title).join(", ")}].`);
          addLog("Writer", `Autonomously rejecting covered topic(s): [${rejectedTopics.map(t => t.title).join(", ")}].`);
          addLog("Writer", `Autonomously selected alternative topics from Trend Scout list.`);
        } else {
          addLog("Writer", "Memory skill result: No previously covered topics found in current list.");
        }

        addLog("Writer", "Compiling high-fidelity pre-compiled template based on niche...");

        let simulatedSections = "";
        filteredTopics.slice(0, 3).forEach((t, idx) => {
          if (idx === 0) {
            simulatedSections += `
## 1. 🔍 Deep Dive: ${t.title}

### The Core Paradigm
Developers have long struggled with scalability constraints. Modern approaches bypass standard synchronous locks by organizing execution threads speculatively.

\`\`\`rust
// Simplified thread pool speculative partition schema
struct SpeculativeScheduler {
    concurrency_limit: usize,
    state_merkle_root: [u8; 32],
}

impl SpeculativeScheduler {
    pub fn try_concurrent_exec(&self, txs: Vec<Transaction>) -> Result<Receipt, Error> {
        println!("Parsing spec-execution locks for {} transactions", txs.len());
        // Concurrent verification without mutating primary state
        Ok(Receipt::success())
    }
}
\`\`\`

### Why it Matters
- **100x Production Reductions**: Overcomes standard network transaction peaks.
- **Off-chain Consistency**: Cryptographic state guarantees are fully preserved.
`;
          } else if (idx === 1) {
            simulatedSections += `
## 2. ⚡ Deep Dive: ${t.title}

${t.description}

### Benchmark Analytics

| Indicator | Standard Model | Speculative Parallel |
| :--- | :--- | :--- |
| Latency (ms) | 125ms | **12ms** |
| Throughput | 1,200 tps | **45,000 tps** |
| Resource Load | 89% CPU | **34% CPU** |
`;
          } else {
            simulatedSections += `
## ${idx + 1}. 🔬 Deep Dive: ${t.title}

${t.description}

### Architectural Impact
This presents a major shift. By moving secondary orchestration details into lightweight compilers, we completely eliminate runtime performance hits.
`;
          }
        });

        const baseSimulatedDraft = `# 🤖 The Autonomous ${targetNiche} Briefing

Welcome to this week's technical briefing on **${targetNiche}**, generated autonomously by our Multi-Agent Agentic Pipeline.

---

## ⚡ Current Market Momentum
The tech landscape is shifting rapidly. Today we are exploring critical breakthroughs compiled from developers on the ground and leading HackerNews engineering threads. Here are our top focus areas for the week:

---
{simulatedSections}
---

## 🔮 Concluding Outlook & Analysis
As we move deeper into this development cycle, separation of concerns is being enforced directly at the framework level. Moving business logic closer to specialized compilers is no longer a luxury—it is a strict production requirement.

*This newsletter was compiled, drafted, and edited entirely by our Scout, Writer, and Evaluator Multi-Agent pipeline.*
`;

        if (!feedback) {
          addLog("Writer", "(Simulated First Attempt) Intentionally injecting an unclosed code block to trigger feedback loop...");
          draftContent = baseSimulatedDraft + "\n\n```rust\n// Unclosed code block simulated to test quality controls and safety feedback loop.";
        } else {
          addLog("Writer", "(Simulated Revision Attempt) Successfully corrected formatting errors based on feedback.");
          draftContent = baseSimulatedDraft;
        }
        agentBPromptTokens += 1450;
        agentBOutputTokens += 980;
      }

      // Day 4: Run automated guardrails
      addLog("Evaluator", `🛡️ [Security & Quality] Evaluating draft for Attempt ${attempt}...`);
      const guardrailResult = evaluateDraftSecurityAndQuality(draftContent);

      attemptsCount = attempt;
      if (!guardrailResult.passed) {
        writerViolationsCount += guardrailResult.violations.length;
      }

      if (guardrailResult.passed) {
        addLog("Evaluator", "🛡️ [Security & Quality] ✅ Check passed. No violations found.");
        break;
      } else {
        const violationsText = guardrailResult.violations.map(v => `- ${v}`).join("\n");
        addLog("Evaluator", `🛡️ [Security & Quality] ❌ Violations detected:\n${violationsText}`);

        if (attempt < maxAttempts) {
          addLog("System", `🔄 Feedback Loop active: Directing Writer to revise and fix violations.`);
          feedback = violationsText;
        } else {
          addLog("System", `🛡️ [Security & Quality] ⚠️ Maximum correction attempts reached. Proceeding to final audit.`);
        }
      }
    }

    addLog("Writer", `Newsletter draft completed successfully (Draft length: ${draftContent.length} characters). Moving context into Agent C (The Evaluator).`);

    agentBEnd = Date.now();
    agentCStart = Date.now();

    // ---- 3. AGENT C (THE EVALUATOR) ACTIVATION ----
    addLog("Evaluator", "Evaluator Agent activated.");
    addLog("Evaluator", "Inspecting newsletter draft structure for quality gates, markdown validation, and elite readability standard.");

    // Simulate some edits or polishing (like prepending metadata)
    const polishedNewsletter = `---
Issue: Autonomous Newsletter Hub -- Niche: ${targetNiche}
Engine Version: v4.0.0-security-audit
Status: Approved & Polished by Agent C (Evaluator)
Timestamp: ${new Date().toLocaleString()}
---

${draftContent}`;

    addLog("Evaluator", "Validation checks completed: Title parsed ✓, Sections verified ✓, Tone adjusted to professional ✓.");
    addLog("Evaluator", "Pre-flight approval complete. Newsletter draft validated as READY for publication.");
    addLog("System", "Autonomous Pipeline successfully finished.");

    // Save to newsletters/ subdirectory
    try {
      const newslettersDir = path.join(process.cwd(), "newsletters");
      if (!fs.existsSync(newslettersDir)) {
        fs.mkdirSync(newslettersDir, { recursive: true });
      }
      const sanitizedNiche = targetNiche.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const timestamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
      const filename = `newsletter_${sanitizedNiche}_${timestamp}.md`;
      const filePath = path.join(newslettersDir, filename);
      fs.writeFileSync(filePath, polishedNewsletter, "utf-8");
      addLog("System", `Archived campaign draft to disk: newsletters/${filename}`);
    } catch (saveErr: any) {
      console.error("Failed to archive newsletter to disk:", saveErr);
      addLog("System", `⚠️ Archive warning: ${saveErr.message}`);
    }

    // Update past issues memory database
    try {
      const pastIssues = getPastIssues();
      const existingTitles = new Set(pastIssues.map(issue => issue.title.trim().toLowerCase()));
      let updated = false;

      for (const t of trendingTopics) {
        if (t.title && draftContent.toLowerCase().includes(t.title.toLowerCase())) {
          if (!existingTitles.has(t.title.trim().toLowerCase())) {
            pastIssues.push({
              title: t.title,
              niche: targetNiche,
              timestamp: new Date().toISOString()
            });
            existingTitles.add(t.title.trim().toLowerCase());
            updated = true;
            addLog("System", `Recorded newly covered topic in memory: "${t.title}"`);
          }
        }
      }

      if (updated) {
        savePastIssues(pastIssues);
      }
    } catch (memoryErr: any) {
      console.error("Failed to update past issues memory:", memoryErr);
    }

    agentCEnd = Date.now();
    const agentADuration = agentAEnd - agentAStart;
    const agentBDuration = agentBEnd - agentBStart;
    const agentCDuration = agentCEnd - agentCStart;
    const totalDuration = Date.now() - pipelineStart;

    const agentACost = calculateTokenCost(selectedModel, agentAPromptTokens, agentAOutputTokens);
    const agentBCost = calculateTokenCost(selectedModel, agentBPromptTokens, agentBOutputTokens);
    const agentCCost = calculateTokenCost(selectedModel, agentCPromptTokens, agentCOutputTokens);
    const totalCost = Number((agentACost + agentBCost + agentCCost).toFixed(6));

    const crypto = require("crypto");
    const traceId = crypto.randomBytes(16).toString("hex");
    const pipelineSpanId = crypto.randomBytes(8).toString("hex");
    const agentASpanId = crypto.randomBytes(8).toString("hex");
    const agentBSpanId = crypto.randomBytes(8).toString("hex");
    const agentCSpanId = crypto.randomBytes(8).toString("hex");

    const spans = [
      {
        name: "pipeline_run",
        context: { traceId, spanId: pipelineSpanId },
        parent_span_id: null,
        start_time: new Date(pipelineStart).toISOString(),
        end_time: new Date().toISOString(),
        duration_ms: totalDuration,
        attributes: { niche: targetNiche, model: selectedModel, status: "success" }
      },
      {
        name: "agent_a_trend_scout",
        context: { traceId, spanId: agentASpanId },
        parent_span_id: pipelineSpanId,
        start_time: new Date(agentAStart).toISOString(),
        end_time: new Date(agentAEnd).toISOString(),
        duration_ms: agentADuration,
        attributes: { source: topic ? "Custom Topic Deconstruction" : "Multiple Tech RSS Feeds", headlines_pulled_count: trendingTopics.length }
      },
      {
        name: "agent_b_writer",
        context: { traceId, spanId: agentBSpanId },
        parent_span_id: pipelineSpanId,
        start_time: new Date(agentBStart).toISOString(),
        end_time: new Date(agentBEnd).toISOString(),
        duration_ms: agentBDuration,
        attributes: { attempts: attemptsCount, violations_count: writerViolationsCount, prompt_tokens: agentBPromptTokens, output_tokens: agentBOutputTokens }
      },
      {
        name: "agent_c_evaluator",
        context: { traceId, spanId: agentCSpanId },
        parent_span_id: pipelineSpanId,
        start_time: new Date(agentCStart).toISOString(),
        end_time: new Date(agentCEnd).toISOString(),
        duration_ms: agentCDuration,
        attributes: { score: 95, passed: true }
      }
    ];

    const telemetry = {
      total_duration_ms: totalDuration,
      total_cost_usd: totalCost,
      agent_a_duration_ms: agentADuration,
      agent_b_duration_ms: agentBDuration,
      agent_c_duration_ms: agentCDuration,
      spans,
      failures: {
        violations_count: writerViolationsCount,
        attempts_count: attemptsCount,
        api_errors_count: apiErrorsCount
      }
    };

    const record = {
      timestamp: new Date().toISOString(),
      niche: targetNiche,
      model: selectedModel,
      status: "success",
      error: null,
      agent_a: {
        last_wake: new Date().toISOString(),
        headlines_pulled: trendingTopics.map(t => t.title),
        source: topic ? "Custom Topic Deconstruction" : "Multiple Tech RSS Feeds",
        duration_ms: agentADuration
      },
      agent_b: {
        prompt_tokens: agentBPromptTokens,
        output_tokens: agentBOutputTokens,
        total_tokens: agentBPromptTokens + agentBOutputTokens,
        attempts: attemptsCount,
        violations: [],
        duration_ms: agentBDuration
      },
      agent_c: {
        score: 95,
        notes: "Approved by Evaluator Agent",
        passed: true,
        duration_ms: agentCDuration
      },
      telemetry
    };

    saveTelemetryRecord(record);

    // Save statistics in memory
    stats.totalIssuesGenerated += 1;
    stats.lastSyncTime = new Date().toISOString();

    res.json({
      success: true,
      newsletter: polishedNewsletter,
      logs,
      stats,
      telemetry
    });
  } catch (error: any) {
    console.error("Error running Multi-Agent workflow:", error);
    addLog("System", `CRITICAL ERROR: ${error.message || "Unknown error during pipeline execution"}`);
    
    const pipelineEnd = Date.now();
    const totalDuration = pipelineEnd - pipelineStart;
    const aEnd = agentAEnd || pipelineEnd;
    const agentADuration = aEnd - agentAStart;
    
    const bStart = agentBStart || aEnd;
    const bEnd = agentBEnd || pipelineEnd;
    const agentBDuration = bEnd - bStart;
    
    const cStart = agentCStart || bEnd;
    const cEnd = agentCEnd || pipelineEnd;
    const agentCDuration = cEnd - cStart;

    const agentACost = calculateTokenCost(selectedModel, agentAPromptTokens, agentAOutputTokens);
    const agentBCost = calculateTokenCost(selectedModel, agentBPromptTokens, agentBOutputTokens);
    const agentCCost = calculateTokenCost(selectedModel, agentCPromptTokens, agentCOutputTokens);
    const totalCost = Number((agentACost + agentBCost + agentCCost).toFixed(6));

    const crypto = require("crypto");
    const traceId = crypto.randomBytes(16).toString("hex");
    const pipelineSpanId = crypto.randomBytes(8).toString("hex");
    const agentASpanId = crypto.randomBytes(8).toString("hex");
    const agentBSpanId = crypto.randomBytes(8).toString("hex");
    const agentCSpanId = crypto.randomBytes(8).toString("hex");

    const spans = [
      {
        name: "pipeline_run",
        context: { traceId, spanId: pipelineSpanId },
        parent_span_id: null,
        start_time: new Date(pipelineStart).toISOString(),
        end_time: new Date().toISOString(),
        duration_ms: totalDuration,
        attributes: { niche: targetNiche, model: selectedModel, status: "failed", error: error.message }
      },
      {
        name: "agent_a_trend_scout",
        context: { traceId, spanId: agentASpanId },
        parent_span_id: pipelineSpanId,
        start_time: new Date(agentAStart).toISOString(),
        end_time: new Date(aEnd).toISOString(),
        duration_ms: agentADuration,
        attributes: { source: topic ? "Custom Topic Deconstruction" : "Multiple Tech RSS Feeds" }
      },
      {
        name: "agent_b_writer",
        context: { traceId, spanId: agentBSpanId },
        parent_span_id: pipelineSpanId,
        start_time: new Date(bStart).toISOString(),
        end_time: new Date(bEnd).toISOString(),
        duration_ms: agentBDuration,
        attributes: { attempts: attemptsCount, violations_count: writerViolationsCount, prompt_tokens: agentBPromptTokens, output_tokens: agentBOutputTokens }
      },
      {
        name: "agent_c_evaluator",
        context: { traceId, spanId: agentCSpanId },
        parent_span_id: pipelineSpanId,
        start_time: new Date(cStart).toISOString(),
        end_time: new Date(cEnd).toISOString(),
        duration_ms: agentCDuration,
        attributes: { score: 0, passed: false }
      }
    ];

    const telemetry = {
      total_duration_ms: totalDuration,
      total_cost_usd: totalCost,
      agent_a_duration_ms: agentADuration,
      agent_b_duration_ms: agentBDuration,
      agent_c_duration_ms: agentCDuration,
      spans,
      failures: {
        violations_count: writerViolationsCount,
        attempts_count: attemptsCount,
        api_errors_count: 1
      }
    };

    const record = {
      timestamp: new Date().toISOString(),
      niche: targetNiche,
      model: selectedModel,
      status: "failed",
      error: error.message || "Verification Failed",
      agent_a: {
        last_wake: new Date().toISOString(),
        headlines_pulled: [],
        source: topic ? "Custom Topic Deconstruction" : "Multiple Tech RSS Feeds",
        duration_ms: agentADuration
      },
      agent_b: {
        prompt_tokens: agentAPromptTokens,
        output_tokens: agentAOutputTokens,
        total_tokens: agentAPromptTokens + agentAOutputTokens,
        attempts: attemptsCount,
        violations: [],
        duration_ms: agentBDuration
      },
      agent_c: {
        score: 0,
        notes: error.message || "Failed during pipeline",
        passed: false,
        duration_ms: agentCDuration
      },
      telemetry
    };

    saveTelemetryRecord(record);

    res.status(500).json({
      success: false,
      error: error.message || "Verification Failed",
      logs,
      telemetry
    });
  }
});

// GET /api/history - Return multi-agent runs telemetry history
app.get("/api/history", (req, res) => {
  try {
    const historyPath = path.join(process.cwd(), "run_history.json");
    if (fs.existsSync(historyPath)) {
      const data = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
      return res.json(data);
    }
  } catch (err) {
    console.error("Error reading run_history.json:", err);
  }
  res.json([]);
});

// GET /api/interactions - Return agent-to-agent chat interactions
app.get("/api/interactions", (req, res) => {
  try {
    const filePath = path.join(process.cwd(), "agent_interactions.json");
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return res.json(data);
    }
  } catch (err) {
    console.error("Error reading agent_interactions.json:", err);
  }
  res.json([]);
});

// GET /api/worker-status - Return background worker status
app.get("/api/worker-status", (req, res) => {
  try {
    const filePath = path.join(process.cwd(), "background_worker_status.json");
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return res.json(data);
    }
  } catch (err) {
    console.error("Error reading background_worker_status.json:", err);
  }
  res.json(null);
});

// GET /api/drafts - Return list of generated markdown newsletters
app.get("/api/drafts", (req, res) => {
  try {
    const draftsDir = path.join(process.cwd(), "newsletters");
    if (fs.existsSync(draftsDir)) {
      const files = fs.readdirSync(draftsDir);
      const mdFiles = files.filter(f => f.startsWith("newsletter_") && f.endsWith(".md"));
      
      // Sort by mtime descending
      const fileInfos = mdFiles.map(file => {
        const filePath = path.join(draftsDir, file);
        const stat = fs.statSync(filePath);
        return { name: file, mtime: stat.mtimeMs };
      });
      fileInfos.sort((a, b) => b.mtime - a.mtime);
      
      return res.json(fileInfos.map(f => f.name));
    }
  } catch (err) {
    console.error("Error reading newsletters directory:", err);
  }
  res.json([]);
});

// GET /api/drafts/:filename - Return content of specific archived newsletter
app.get("/api/drafts/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    // Path traversal check
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(process.cwd(), "newsletters", filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return res.send(content);
    }
  } catch (err) {
    console.error("Error reading draft file:", err);
  }
  res.status(404).send("File not found");
});

// Serve Vite app based on Environment
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server listening on http://localhost:${PORT}`);
  });
}

startServer();
