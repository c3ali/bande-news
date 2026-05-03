import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str) {
  return str
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&amp;/gi, "&")
    .replace(/&#039;/gi, "'").replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'").replace(/&amp;#039;/gi, "'");
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
];

const CATEGORY_MAP = {
  "الأنشطة الملكية": "activites_royales",
  "الأنشطة الأميرية": "activites_princieres",
  "سياسة": "politique",
  "رياضة": "sport",
  "مجتمع": "social",
  "اقتصاد": "economie",
  "فن و ثقافة": "culture",
  "عالم": "monde",
  "تكنولوجيا": "technologie",
  "إفريقيا": "afrique",
};

const CATEGORY_PATTERNS = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([ar, en]) => [en, new RegExp(ar, "i")])
);

export async function fetchSnrtNews(targetCategory = "all", limit = 20) {
  const url = "https://snrtnews.com";
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  console.log(`\n📡 SNRTnews — Récupération de la page...\n`);

  let html = null;
  const methods = [
    async () => {
      const res = await fetch(url, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "ar,fr-FR,fr;q=0.9,en;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
          "DNT": "1",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const t = await res.text();
      if (t.length < 500) throw new Error("Response too short");
      return t;
    },
    async () => {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
      const t = await res.text();
      if (t.length < 500) throw new Error("Proxy response too short");
      return t;
    },
    async () => {
      const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`CodeTabs HTTP ${res.status}`);
      const t = await res.text();
      if (t.length < 500) throw new Error("CodeTabs response too short");
      return t;
    },
  ];

  const errors = [];
  for (const method of methods) {
    try {
      html = await method();
      if (html && html.length > 500 && html.includes("آخر الأخبار")) break;
      html = null;
    } catch (e) {
      errors.push(e.message);
    }
  }

  if (!html) {
    throw new Error(`All methods failed: ${errors.join(" | ")}`);
  }

  console.log(`✅ HTML récupéré (${html.length} caractères)\n`);
  const articles = [];
  const seen = new Set();

  const blocks = html.split(/(\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2})/);

  for (let i = 1; i < blocks.length; i += 2) {
    const timeStr = blocks[i];
    const contentBlock = blocks[i + 1] || "";

    const dateParts = timeStr.match(/(\d{2})\/(\d{2})\/(\d{4}) - (\d{2}:\d{2})/);
    if (!dateParts) continue;
    const date = `${dateParts[3]}-${dateParts[2]}T${dateParts[4]}:00`;

    const catMatch = contentBlock.match(/>([^<]{4,30})<\//);
    let matchedCategory = "general";

    if (targetCategory === "all") {
      if (catMatch) {
        const rawCat = catMatch[1].trim();
        matchedCategory = CATEGORY_MAP[rawCat] || "general";
      }
    } else {
      matchedCategory = targetCategory;
    }

    const lines = contentBlock.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    let title = "";
    for (const line of lines) {
      const clean = line.replace(/<[^>]*>/g, "").trim();
      if (clean.length > 15
        && !clean.match(/^\d{2}\/\d{2}\/\d{4}/)
        && clean !== "آخر الأخبار"
        && clean !== "الأنشطة الملكية"
        && clean !== "الأنشطة الأميرية"
        && clean !== "أخبار"
        && clean !== "مختصرات"
        && !clean.match(/^(سياسة|رياضة|مجتمع|اقتصاد|فن و ثقافة|عالم|تكنولوجيا|إفريقيا)$/)
      ) {
        title = clean;
        break;
      }
    }

    if (title && !seen.has(title)) {
      seen.add(title);
      articles.push({
        title: decodeHtmlEntities(title.replace(/&nbsp;/g, " ")).replace(/\s+/g, " ").trim(),
        date,
        category: matchedCategory,
        source: "SNRTnews"
      });
    }
  }

  const unique = [];
  const finalSeen = new Set();
  for (const a of articles) {
    const key = a.title.substring(0, 30);
    if (!finalSeen.has(key)) {
      finalSeen.add(key);
      unique.push(a);
    }
  }

  const result = unique.slice(0, limit).map((a, i) => ({
    id: i + 1,
    title: a.title,
    date: a.date,
    category: a.category,
    source: a.source,
  }));

  console.log(`✅ ${result.length} article(s) récupéré(s) depuis SNRTnews\n`);
  return result;
}