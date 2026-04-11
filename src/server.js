import express from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const CACHE = new Map();

const config = JSON.parse(
  readFileSync(resolve(__dirname, "../config.json"), "utf-8")
);

function getRequestHeaders() {
  return {
    "User-Agent": config.user_agent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ar,en;q=0.7,fr;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };
}

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

function extractArticlesFromActualites(html) {
  const articles = [];
  const seen = new Set();
  const blocks = html.split(/<div class="block-1">/);

  for (const block of blocks) {
    const titleMatch = block.match(/<span class="field-content"><a href="\/ar\/actualites\/[^"]+">([^<]+)<\/a><\/span>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim();
    if (title.length < 10 || title === TITMIMA || seen.has(title)) continue;
    seen.add(title);

    const dateMatch = block.match(/<div class="field-content date-actualites">([^<]+)<\/div>/);
    const date = dateMatch ? dateMatch[1].trim() : "";

    articles.push({ title, date });
  }
  return articles;
}

function extractArticlesFromRoyales(html) {
  const articles = [];
  const seen = new Set();

  const rows = html.split(/<div class="element_over_hidden views-row/);
  for (const row of rows) {
    const titleMatch = row.match(/page_second_title[^>]*><a href="\/ar\/activites-royales\/[^"]+">([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim();
    if (title.length < 10 || title === TITMIMA || seen.has(title)) continue;
    seen.add(title);

    const dateMatch = row.match(/<div class="field-content node-date">([^<]+)<\/div>/);
    const date = dateMatch ? dateMatch[1].trim() : "";

    articles.push({ title, date });
  }

  if (articles.length < 3) {
    const re = /<span class="field-content page_(?:first|second)_title"><a href="\/ar\/activites-royales\/[^"]+">([^<]+)<\/a><\/span>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const title = decodeHtmlEntities(m[1]).replace(/\s+/g, " ").trim();
      if (title.length < 10 || title === TITMIMA || seen.has(title)) continue;
      seen.add(title);
      articles.push({ title, date: "" });
    }
  }

  return articles;
}

function parseArticlesFromHtml(html, catKey) {
  if (catKey === "activites_royales") {
    return extractArticlesFromRoyales(html);
  }
  return extractArticlesFromActualites(html);
}

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserInstance;
}

async function fetchViaBrowser(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(config.user_agent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await page.setExtraHTTPHeaders({ "Accept-Language": "ar,en;q=0.7,fr;q=0.5" });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

async function fetchPage(url, headers) {
  try {
    const res = await fetch(url, { headers, redirect: "follow" });
    if (res.ok) {
      const text = await res.text();
      if (!text.includes("Just a moment")) return text;
    }
  } catch {}
  return fetchViaBrowser(url);
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
  const html = await fetchPage(url, headers);

  let articles = parseArticlesFromHtml(html, catKey);

  if (articles.length < limit) {
    const pages = [1, 2, 3, 4];
    for (const page of pages) {
      if (articles.length >= limit) break;
      await sleep(delay);
      try {
        const pageUrl = `${url}?page=${page}`;
        const pageHtml = await fetchPage(pageUrl, headers);
        const pageArticles = parseArticlesFromHtml(pageHtml, catKey);
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

async function ollamaTranslate(texts, targetLang) {
  const langName = targetLang === "fr" ? "French" : "English";
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt = `Translate each of the following Arabic news headlines to ${langName}. Keep the numbering. Output ONLY the translations, one per line, numbered. Do not add any explanation.

${numbered}`;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.message?.content || "";
  const translations = [];
  const lines = content.split("\n").map(l => l.replace(/^\d+[\.\)\-]\s*/, "").trim()).filter(l => l.length > 0);

  for (let i = 0; i < texts.length; i++) {
    translations.push(lines[i] || "");
  }

  return translations;
}

app.use(express.json());
app.use(express.static(resolve(__dirname, "../public")));

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
    const translations = await ollamaTranslate(texts, lang);
    res.json({ success: true, target_lang: lang, translations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

app.listen(PORT, () => {
  console.log(`\n  📰 Bande News — http://localhost:${PORT}\n`);
});

