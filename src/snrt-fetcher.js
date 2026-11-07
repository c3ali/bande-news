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

function formatDateTime(date, time) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}:00`;
}

function parseWaybackDate(url) {
  const match = url.match(/\/web\/(\d{4})(\d{2})(\d{2})/);
  if (match) {
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
  }
  return new Date();
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

const SNRT_CATEGORIES = {
  activites_royales: "الأنشطة-الملكية",
  activites_princieres: "الأنشطة-الأميرية",
  politique: "سياسة",
  sport: "رياضة",
  social: "مجتمع",
  economie: "اقتصاد",
  culture: "فن-وثقافة",
  monde: "عالم",
  technologie: "تكنولوجيا",
  afrique: "إفريقيا",
};

async function fetchSnrtPage(url) {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const methods = [
    async () => {
      const res = await fetch(url, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "ar,fr-FR,fr;q=0.9,en;q=0.7",
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
      return { html: t, source: "direct" };
    },
    async () => {
      const waybackUrl = `https://web.archive.org/web/2026/${encodeURIComponent(url)}`;
      const res = await fetch(waybackUrl, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`Wayback HTTP ${res.status}`);
      const t = await res.text();
      if (t.length < 1000 || t.includes("Just a moment")) throw new Error("Wayback: no snapshot");
      return { html: t, source: "wayback" };
    },
  ];

  for (const method of methods) {
    try {
      const result = await method();
      if (result.html && result.html.length > 500 && result.html.includes("آخر الأخبار")) return result;
    } catch {}
  }
  return null;
}

function cleanWaybackHtml(html) {
  // Remove Wayback URL prefixes like /web/20260204090223/https://snrtnews.com/
  return html.replace(/\/web\/\d+(?:id_|cs_|)\//g, "");
}

function parseSnrtHtml(html, forcedCategory = null) {
  const articles = [];
  const seen = new Set();

  // Parse flash news items (only on home page, have time but no date)
  const flashNewsRe = /<li class="flash-news"[^>]*>[\s\S]*?<div class="date-flashnews">(\d{2}:\d{2})<\/div>[\s\S]*?<h2>([^<]+)<\/h2>[\s\S]*?<h3[^>]*><a[^>]*href="[^"]*\/article\/\d+"[^>]*>([^<]+)<\/a><\/h3>[\s\S]*?<\/li>/g;
  let m;
  while ((m = flashNewsRe.exec(html)) !== null) {
    const time = m[1];
    const rawCat = m[2].trim();
    const title = decodeHtmlEntities(m[3]).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (!title || title.length < 10 || seen.has(title)) continue;
    seen.add(title);
    const cat = forcedCategory || CATEGORY_MAP[rawCat] || "general";
    articles.push({ title, date: formatDateTime(new Date(), time), category: cat, source: "SNRTnews" });
  }

  // Parse thematic section articles
  const thematicRe = /<div class="holder-thematique-home"[^>]*>[\s\S]*?<div class="date_publication">(\d{2}\/\d{2}\/\d{4}) - (\d{2}:\d{2})<\/div>[\s\S]*?<div class="info_thematique_home">[\s\S]*?<h2><a[^>]*href="[^"]*\/article\/\d+"[^>]*>([^<]+)<\/a><\/h2>[\s\S]*?<\/div>/g;
  while ((m = thematicRe.exec(html)) !== null) {
    const day = m[1].split("/");
    const time = m[2];
    const title = decodeHtmlEntities(m[3]).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (!title || title.length < 10 || seen.has(title)) continue;
    seen.add(title);
    let cat = forcedCategory || "general";
    if (!forcedCategory) {
      const preContext = html.substring(Math.max(0, m.index - 500), m.index);
      const catMatch = preContext.match(/<h2><a[^>]*href="[^"]*thematique\/([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/);
      if (catMatch) {
        cat = CATEGORY_MAP[catMatch[2].trim()] || "general";
      }
    }
    articles.push({ title, date: `${day[2]}-${day[1]}-${day[0]}T${time}:00`, category: cat, source: "SNRTnews" });
  }

  // Parse main featured article
  const mainRe = /<h1 class="news_title_une"><a[^>]*href="[^"]*\/article\/\d+"[^>]*>([^<]+)<\/a><\/h1>/;
  const mainMatch = html.match(mainRe);
  if (mainMatch) {
    const title = decodeHtmlEntities(mainMatch[1]).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (title && title.length >= 10 && !seen.has(title)) {
      seen.add(title);
      let cat = forcedCategory || "general";
      if (!forcedCategory) {
        const catMatch2 = html.match(/<div class="last_news_info">[\s\S]*?<div class="field-content[^"]*"><h2>([^<]+)<\/h2>/);
        if (catMatch2) cat = CATEGORY_MAP[catMatch2[1].trim()] || "general";
      }
      const dateMatch = html.match(/<div class="date_publication">(\d{2}\/\d{2}\/\d{4}) - (\d{2}:\d{2})<\/div>/);
      const date = dateMatch ? `${dateMatch[1].split("/")[2]}-${dateMatch[1].split("/")[1]}-${dateMatch[1].split("/")[0]}T${dateMatch[2]}:00` : "";
      articles.unshift({ title, date, category: cat, source: "SNRTnews" });
    }
  }

  return articles;
}

export async function fetchSnrtNews(targetCategory = "all", limit = 20) {
  const allArticles = [];

  if (targetCategory !== "all") {
    // Single category
    const slug = SNRT_CATEGORIES[targetCategory];
    if (!slug) throw new Error(`Unknown category: ${targetCategory}`);
    const url = `https://snrtnews.com/thematique/${slug}`;
    console.log(`\n📡 SNRTnews — Catégorie: ${targetCategory} → ${url}\n`);

    const result = await fetchSnrtPage(url);
    if (!result) throw new Error(`Failed to fetch ${url}`);

    console.log(`✅ HTML récupéré via ${result.source} (${result.html.length} caractères)\n`);
    const html = result.source === "wayback" ? cleanWaybackHtml(result.html) : result.html;
    const articles = parseSnrtHtml(html, targetCategory);
    allArticles.push(...articles);
  } else {
    // All categories — fetch home page only (contains flash news + thematic sections)
    const url = "https://snrtnews.com";
    console.log(`\n📡 SNRTnews — Page d'accueil → ${url}\n`);

    const result = await fetchSnrtPage(url);
    if (!result) throw new Error("Failed to fetch SNRT home page");

    console.log(`✅ HTML récupéré via ${result.source} (${result.html.length} caractères)\n`);
    const html = result.source === "wayback" ? cleanWaybackHtml(result.html) : result.html;
    const articles = parseSnrtHtml(html);
    allArticles.push(...articles);
  }

  // Deduplicate by title prefix
  const unique = [];
  const finalSeen = new Set();
  for (const a of allArticles) {
    const key = a.title.substring(0, 40);
    if (!finalSeen.has(key)) {
      finalSeen.add(key);
      unique.push(a);
    }
  }

  // Sort by date descending (most recent first)
  unique.sort((a, b) => {
    const da = a.date ? new Date(a.date) : new Date(0);
    const db = b.date ? new Date(b.date) : new Date(0);
    return db - da;
  });

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
