import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(
  readFileSync(resolve(__dirname, "../config.json"), "utf-8")
);

function decodeHtmlEntities(str) {
  return str
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;#039;/gi, "'");
}

function extractTag(block, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : "";
}

function cleanTitle(raw) {
  let t = decodeHtmlEntities(raw);
  t = t.replace(/<a[^>]*>/gi, "").replace(/<span[^>]*>/gi, "");
  t = t.replace(/<\/a>/gi, "").replace(/<\/span>/gi, "");
  return t.trim();
}

export async function fetchNews(limit = config.default_limit) {
  console.log(`\n📡 Recuperation du flux RSS arabe: ${config.rss_url} ...\n`);

  const response = await fetch(config.rss_url, {
    headers: {
      "User-Agent": "BandeNews/1.0",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const xml = await response.text();
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const articles = [];
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleRaw = extractTag(block, "title");
    const title = cleanTitle(titleRaw);
    const pubDate = extractTag(block, "pubDate");

    articles.push({ title, date: pubDate });
  }

  const result = articles.slice(0, limit).map((a, i) => ({
    id: i + 1,
    title: a.title,
    date: a.date,
  }));

  console.log(`✅ ${result.length} article(s) recupere(s)\n`);
  return result;
}

export { config };
