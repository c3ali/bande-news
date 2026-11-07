import express from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;
const NANO_GPT_KEY = process.env.NANO_GPT_KEY || "sk-nano-a9dfba3d-d1ab-4ce3-9e47-c7d7840d8894";
const NANO_GPT_MODEL = process.env.NANO_GPT_MODEL || "google/gemma-4-31b-it";
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "";
const CACHE = new Map();

app.use(express.json({ limit: "5mb" }));
app.use(express.static(resolve(__dirname, "../public"), {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
}));
app.use("/videos", express.static(resolve(__dirname, "../bande-news-video/videos")));

import { fetchSnrtNews } from "./snrt-fetcher.js";

app.use("/api/import", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const config = JSON.parse(
  readFileSync(resolve(__dirname, "../config.json"), "utf-8")
);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getCached(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  const ttl = (config.cache_ttl_min || 60) * 60 * 1000;
  if (Date.now() - entry.ts > ttl) { CACHE.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  CACHE.set(key, { data, ts: Date.now() });
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&amp;/gi, "&")
    .replace(/&#039;/gi, "'").replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'").replace(/&amp;#039;/gi, "'");
}

const TITMIMA = "\u062A\u0640\u062A\u0640\u0645\u0640\u0629";

function extractArticlesFromHtml(html, catKey) {
  const articles = [];
  const seen = new Set();

  // The new mapnews.ma uses <article> tags with <h2>/<h3> for titles and <time> for dates
  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let m;

  while ((m = articleRe.exec(html)) !== null) {
    const articleHtml = m[1];

    // Try h2 first, then h3 for title
    const titleMatch = articleHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || articleHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!titleMatch) continue;

    let title = decodeHtmlEntities(titleMatch[1]).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (title.length < 10 || title === TITMIMA || seen.has(title)) continue;
    seen.add(title);

    // Try to find date in <time> tag
    const dateMatch = articleHtml.match(/<time[^>]*>([\s\S]*?)<\/time>/i);
    const date = dateMatch ? decodeHtmlEntities(dateMatch[1]).replace(/<[^>]*>/g, "").trim() : "";

    articles.push({ title, date });
  }

  return articles;
}

function getRequestHeaders() {
  return {
    "User-Agent": config.user_agent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en;q=0.7,fr;q=0.5",
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchViaScraperApi(url) {
  if (!SCRAPER_API_KEY) throw new Error("SCRAPER_API_KEY not set");
  const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true`;
  const res = await fetchWithTimeout(apiUrl, {}, 30000);
  if (!res.ok) throw new Error(`ScraperAPI HTTP ${res.status}`);
  const html = await res.text();
  if (html.length < 500 || html.includes("Just a moment")) throw new Error("ScraperAPI: Cloudflare not bypassed");
  return html;
}

async function fetchViaProxy(url) {
  const proxies = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];
  for (const makeUrl of proxies) {
    try {
      const res = await fetchWithTimeout(makeUrl(url), {}, 10000);
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length > 500 && !html.includes("Just a moment") && !html.includes("challenge-platform")) {
        return html;
      }
    } catch {}
  }
  throw new Error("All proxies failed");
}

async function fetchViaWayback(url) {
  const waybackUrl = `https://web.archive.org/web/2025/${encodeURIComponent(url)}`;
  const res = await fetchWithTimeout(waybackUrl, {}, 30000);
  if (!res.ok) throw new Error(`Wayback HTTP ${res.status}`);
  const html = await res.text();
  if (html.length < 1000 || html.includes("Just a moment") || html.includes("challenge-platform")) {
    throw new Error("Wayback: no snapshot or Cloudflare");
  }
  return html;
}

async function fetchViaFlareSolverr(url) {
  const res = await fetchWithTimeout(`${FLARESOLVERR_URL}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cmd: "request.get",
      url,
      maxTimeout: 60000,
    }),
  }, 65000);
  const data = await res.json();
  if (!res.ok || data.status !== "ok") {
    throw new Error(`FlareSolverr: ${data.message || data.status || res.status}`);
  }
  return data.solution.response;
}

async function fetchPageHtml(url, headers) {
  const errors = [];

  try {
    return await fetchViaScraperApi(url);
  } catch (e) { errors.push(`scraperapi: ${e.message}`); }

  try {
    const response = await fetchWithTimeout(url, { headers }, 10000);
    if (response.ok) {
      const html = await response.text();
      if (!html.includes("Just a moment") && !html.includes("challenge-platform")) {
        return html;
      }
      errors.push("direct: Cloudflare challenge");
    } else {
      errors.push(`direct: HTTP ${response.status}`);
    }
  } catch (e) { errors.push(`direct: ${e.message}`); }

  try {
    return await fetchViaFlareSolverr(url);
  } catch (e) { errors.push(`flaresolverr: ${e.message}`); }

  try {
    return await fetchViaProxy(url);
  } catch (e) { errors.push(`proxy: ${e.message}`); }

  try {
    return await fetchViaWayback(url);
  } catch (e) { errors.push(`wayback: ${e.message}`); }

  throw new Error(`All methods failed: ${errors.join(" | ")}`);
}

function parseRssDate(pubDate) {
  if (!pubDate) return "";
  try {
    const d = new Date(pubDate);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ""; }
}

function stripHtmlEntities(str) {
  return str
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'").replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchRssArticles(catKey, limit = 20) {
  const cat = config.categories[catKey];
  if (!cat || !cat.rss_path) throw new Error(`No RSS for category: ${catKey}`);

  const articles = [];
  const seen = new Set();

  // RSS pages are 0-indexed, each page has ~9-10 items
  for (let page = 0; page < 3; page++) {
    if (articles.length >= limit) break;

    const rssUrl = `${config.base_url}${cat.rss_path}${page > 0 ? `?page=${page}` : ""}`;
    try {
      const res = await fetchWithTimeout(rssUrl, { headers: getRequestHeaders() }, 15000);
      if (!res.ok) break;
      const xml = await res.text();

      // Parse RSS items
      const itemRe = /<item>[\s\S]*?<\/item>/g;
      let m;
      while ((m = itemRe.exec(xml)) !== null) {
        const item = m[0];
        const titleMatch = item.match(/<title>([^<]+)<\/title>/);
        const dateMatch = item.match(/<pubDate>([^<]+)<\/pubDate>/);
        if (!titleMatch) continue;

        let title = stripHtmlEntities(titleMatch[1]);
        if (!title || title.length < 10 || seen.has(title)) continue;
        seen.add(title);

        const date = parseRssDate(dateMatch ? dateMatch[1] : "");
        articles.push({ title, date });
        if (articles.length >= limit) break;
      }
    } catch {
      break;
    }
  }

  return articles.map((a, i) => ({
    id: i + 1,
    title: a.title,
    date: a.date,
    category: catKey,
    category_label: cat.label,
    category_label_fr: cat.label_fr,
  }));
}

async function fetchCategoryArticles(catKey, limit = 20) {
  const cat = config.categories[catKey];
  if (!cat) throw new Error(`Unknown category: ${catKey}`);

  const cacheKey = `${catKey}:${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const delay = config.scrape_delay_ms || 1500;
  const headers = getRequestHeaders();
  const url = `${config.base_url}${cat.url}`;

  const html = await fetchPageHtml(url, headers);

  let articles = extractArticlesFromHtml(html, catKey);

  if (articles.length < limit) {
    const pages = [1, 2, 3, 4];
    for (const page of pages) {
      if (articles.length >= limit) break;
      await sleep(delay);
      try {
        const pageUrl = `${url}?page=${page}`;
        const pageHtml = await fetchPageHtml(pageUrl, headers);
        const pageArticles = extractArticlesFromHtml(pageHtml, catKey);
        if (pageArticles.length === 0) break;
        articles = articles.concat(pageArticles);
      } catch { break; }
    }
  }

  const unique = [];
  const seenFinal = new Set();
  for (const a of articles) {
    if (!seenFinal.has(a.title)) { seenFinal.add(a.title); unique.push(a); }
  }
  articles = unique.slice(0, limit);

  const result = articles.map((a, i) => ({
    id: i + 1,
    title: a.title,
    date: a.date,
    category: catKey,
    category_label: cat.label,
    category_label_fr: cat.label_fr,
  }));

  setCache(cacheKey, result);
  return result;
}

async function tryTranslateWithCredits(texts, targetLang) {
  const langName = targetLang === "fr" ? "French" : "English";
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const abbrevRule = targetLang === "fr"
    ? 'Never spell out "Sa Majesté": always use the abbreviation "SM" (e.g. "SM le Roi Mohammed VI").'
    : 'Never spell out "His Majesty": always use the abbreviation "HM" (e.g. "HM King Mohammed VI").';
  const prompt = `Translate each of the following Arabic news headlines to ${langName}. Keep the numbering. Output ONLY the translations, one per line, numbered. Do not add any explanation. ${abbrevRule}

${numbered}`;

  const res = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${NANO_GPT_KEY}`,
      "X-Billing-Mode": "paygo",
    },
    body: JSON.stringify({
      model: NANO_GPT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NanoGPT paygo failed ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  return content.split("\n").map(l => l.replace(/^\d+[\.\)\-]\s*/, "").replace(/\.+$/, "").trim()).filter(l => l.length > 0);
}

async function nanoGptTranslate(texts, targetLang) {
  const langName = targetLang === "fr" ? "French" : "English";
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const abbrevRule = targetLang === "fr"
    ? 'Never spell out "Sa Majesté": always use the abbreviation "SM" (e.g. "SM le Roi Mohammed VI").'
    : 'Never spell out "His Majesty": always use the abbreviation "HM" (e.g. "HM King Mohammed VI").';
  const prompt = `Translate each of the following Arabic news headlines to ${langName}. Keep the numbering. Output ONLY the translations, one per line, numbered. Do not add any explanation. ${abbrevRule}

${numbered}`;

  const res = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${NANO_GPT_KEY}`,
    },
    body: JSON.stringify({
      model: NANO_GPT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429 && (errText.includes("limit") || errText.includes("quota") || errText.includes("subscription"))) {
      return tryTranslateWithCredits(texts, targetLang);
    }
    throw new Error(`NanoGPT error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const translations = [];
  const lines = content.split("\n").map(l => l.replace(/^\d+[\.\)\-]\s*/, "").replace(/\.+$/, "").trim()).filter(l => l.length > 0);

  for (let i = 0; i < texts.length; i++) {
    translations.push(lines[i] || "");
  }

  return translations;
}

app.get("/api/categories", (req, res) => {
  const cats = Object.entries(config.categories).map(([key, val]) => ({
    key,
    label: val.label,
    label_fr: val.label_fr,
  }));
  res.json({ success: true, categories: cats });
});

app.get("/api/fetch-category/:catKey", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || config.default_limit || 20;
    const articles = await fetchCategoryArticles(req.params.catKey, limit);
    res.json({ success: true, category: req.params.catKey, total: articles.length, articles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/fetch-all", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || config.default_limit || 20;
    const allArticles = {};
    const errors = [];

    for (const catKey of Object.keys(config.categories)) {
      try {
        allArticles[catKey] = await fetchCategoryArticles(catKey, limit);
      } catch (err) {
        errors.push({ category: catKey, error: err.message });
        allArticles[catKey] = [];
      }
    }

    const total = Object.values(allArticles).reduce((s, a) => s + a.length, 0);
    res.json({ success: true, total, categories: allArticles, errors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/translate", async (req, res) => {
  try {
    const { texts, target_lang } = req.body;
    if (!texts || !Array.isArray(texts) || !texts.length) {
      return res.status(400).json({ success: false, error: "texts array required" });
    }
    const lang = target_lang === "en" ? "en" : "fr";
    const translations = await nanoGptTranslate(texts, lang);
    res.json({ success: true, target_lang: lang, translations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/import", (req, res) => {
  const { categories } = req.body;
  if (!categories) return res.status(400).json({ error: "categories required" });

  const outputDir = resolve(__dirname, "../output");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const payload = {
    metadata: { source: "mapnews.ma", collect_date: new Date().toISOString(), imported: true },
    categories,
  };

  const filename = `collecte_${ts}.json`;
  writeFileSync(resolve(outputDir, filename), JSON.stringify(payload, null, 2), "utf-8");

  for (const [catKey, articles] of Object.entries(categories)) {
    setCache(`${catKey}:${articles.length}`, articles);
  }

  const totalArticles = Object.values(categories).reduce((s, a) => s + a.length, 0);
  res.json({ success: true, filename, total: totalArticles });
});

app.get("/api/collectes", (req, res) => {
  const outputDir = resolve(__dirname, "../output");
  if (!existsSync(outputDir)) return res.json({ success: true, files: [] });
  const files = readdirSync(outputDir)
    .filter((f) => f.startsWith("collecte_") && f.endsWith(".json"))
    .sort().reverse()
    .map((f) => ({ name: f, path: join(outputDir, f) }));
  res.json({ success: true, files });
});

app.get("/api/collecte/:filename", (req, res) => {
  const filepath = resolve(__dirname, "../output", req.params.filename);
  if (!existsSync(filepath)) return res.status(404).json({ error: "Not found" });
  res.json(JSON.parse(readFileSync(filepath, "utf-8")));
});

app.post("/api/save", (req, res) => {
  const outputDir = resolve(__dirname, "../output");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `collecte_${ts}.json`;
  const filepath = resolve(outputDir, filename);
  writeFileSync(filepath, JSON.stringify(req.body, null, 2), "utf-8");
  res.json({ success: true, filename, filepath });
});

app.post("/api/export", (req, res) => {
  const { articles } = req.body;
  if (!articles || !articles.length) return res.status(400).json({ error: "No articles" });

  const outputDir = resolve(__dirname, "../output");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const sep = "§";
  const arSection = articles.map((a) => a.ar).join(`\n${sep}\n`);
  const frSection = articles.map((a) => a.fr || "").join(`\n${sep}\n`);
  const enSection = articles.map((a) => a.en || "").join(`\n${sep}\n`);
  const txtContent = `${arSection}\n${sep}\n\n${frSection}\n${sep}\n\n${enSection}\n${sep}\n`;

  const txtPath = resolve(outputDir, `bande-news_${ts}.txt`);
  writeFileSync(txtPath, txtContent, "utf-8");

  const jsonContent = {
    metadata: { source: "mapnews.ma", collect_date: new Date().toISOString(), total_articles: articles.length },
    articles: articles.map((a, i) => ({ id: i + 1, ar: a.ar, fr: a.fr, en: a.en })),
  };
  const jsonPath = resolve(outputDir, `bande-news_${ts}.json`);
  writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2), "utf-8");

  res.json({ success: true, txtFile: txtPath, jsonFile: jsonPath, content: txtContent });
});

app.get("/api/snrt/categories", (req, res) => {
  const categories = {
    activites_royales: { key: "activites_royales", label: "الأنشطة الملكية", label_fr: "Activités royales" },
    activites_princieres: { key: "activites_princieres", label: "الأنشطة الأميرية", label_fr: "Activités princières" },
    politique: { key: "politique", label: "سياسة", label_fr: "Politique" },
    sport: { key: "sport", label: "رياضة", label_fr: "Sport" },
    social: { key: "social", label: "مجتمع", label_fr: "Société" },
    economie: { key: "economie", label: "اقتصاد", label_fr: "Économie" },
    culture: { key: "culture", label: "فن و ثقافة", label_fr: "Culture" },
    monde: { key: "monde", label: "عالم", label_fr: "Monde" },
    technologie: { key: "technologie", label: "تكنولوجيا", label_fr: "Technologie" },
    afrique: { key: "afrique", label: "إفريقيا", label_fr: "Afrique" },
  };
  res.json({ success: true, source: "SNRTnews", categories: Object.values(categories) });
});

app.get("/api/snrt/fetch", async (req, res) => {
  try {
    const category = req.query.category || "all";
    let limit = parseInt(req.query.limit) || config.default_limit || 20;
    // When fetching all categories, we need more articles to fill each category
    if (category === "all") limit = limit * 10;
    const articles = await fetchSnrtNews(category, limit);
    res.json({ success: true, source: "SNRTnews", category, total: articles.length, articles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/debug", async (req, res) => {
  const results = {};
  const testUrl = `${config.base_url}/ar/actualites/politique`;

  results.scraperapi = "pending";
  try {
    const t = await fetchViaScraperApi(testUrl);
    results.scraperapi = { length: t.length, hasArticles: t.includes("block-1") };
  } catch (e) { results.scraperapi = { error: e.message }; }

  results.direct = "pending";
  try {
    const r = await fetchWithTimeout(testUrl, { headers: getRequestHeaders() }, 10000);
    const t = await r.text();
    results.direct = { status: r.status, length: t.length, hasArticles: t.includes("block-1"), isCloudflare: t.includes("Just a moment") };
  } catch (e) { results.direct = { error: e.message }; }

  res.json({ success: true, env: { SCRAPER_API_KEY: SCRAPER_API_KEY ? "configured" : "missing", NODE_VERSION: process.version }, results });
});

const HF_DIR = resolve(__dirname, "../bande-news-video");
const VIDEO_OUTPUT_DIR = resolve(HF_DIR, "videos");
const STATUS_FILE = resolve(HF_DIR, "render-status.json");

app.get("/api/video-status", (req, res) => {
  res.header("Cache-Control", "no-cache");
  if (!existsSync(STATUS_FILE)) return res.json({ phase: "idle", percent: 0, message: "Aucune génération en cours" });
  try {
    const data = JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
    res.json(data);
  } catch {
    res.json({ phase: "idle", percent: 0, message: "Statut indisponible" });
  }
});

app.get("/api/videos", (req, res) => {
  if (!existsSync(VIDEO_OUTPUT_DIR)) return res.json({ success: true, videos: [] });
  const videos = readdirSync(VIDEO_OUTPUT_DIR)
    .filter(f => f.endsWith(".mp4"))
    .map(f => {
      const s = readFileSync(resolve(VIDEO_OUTPUT_DIR, f));
      return { name: f, size: s.length, path: `/videos/${f}` };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
  res.json({ success: true, videos });
});

app.post("/api/generate-video", (req, res) => {
  // Reset status
  writeFileSync(STATUS_FILE, JSON.stringify({ phase: "starting", percent: 0, message: "Démarrage...", ts: Date.now() }), "utf-8");

  // If articles are provided, save them for the generator to pick up
  const selectedFile = resolve(HF_DIR, "selected-articles.json");
  if (req.body && req.body.articles && Array.isArray(req.body.articles)) {
    writeFileSync(selectedFile, JSON.stringify({ articles: req.body.articles, ts: Date.now() }, null, 2), "utf-8");
  } else if (existsSync(selectedFile)) {
    // clean up stale file
    try { unlinkSync(selectedFile); } catch {}
  }

  const child = spawn(process.execPath, [resolve(__dirname, "generate-video.js")], {
    detached: true, stdio: "ignore", windowsHide: true
    // Dans l'app desktop (Electron), on relance le generateur en pur Node
    ...(process.versions.electron ? { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } } : {})
  });
  child.unref();

  res.json({ success: true, pid: child.pid, message: "Génération lancée en arrière-plan" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  📰 Bande News — http://localhost:${PORT}\n`);
});
