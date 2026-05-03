import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, "../config.json"), "utf-8"));
const API_BASE = "http://localhost:3002";
const HF_DIR = resolve(__dirname, "../bande-news-video");
const OUTPUT_DIR = resolve(HF_DIR, "videos");

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try { await fetchJson(`${API_BASE}/api/categories`); return true; } catch {
      console.log(`  Attente du serveur... (${i + 1}/${maxRetries})`);
      await sleep(2000);
    }
  }
  throw new Error("Serveur API indisponible. Lance d'abord: npm run server");
}

function escapeHtml(str) {
  return str.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "\"").replace(/\n/g, " ");
}

function buildArticlesList(articlesByCategory, vidConfig) {
  const articles = [];
  for (const catKey of vidConfig.categories_order) {
    const items = (articlesByCategory[catKey] || []).slice(0, vidConfig.items_per_category);
    for (const article of items) {
      articles.push({
        ar: article.title,
        fr: article.title_fr || "",
        en: article.title_en || "",
      });
    }
  }
  return articles;
}

function generateBandHtml(articles, vidConfig) {
  const t = vidConfig.ticker;
  const sep = t.separator;
  const BH = t.band_height;
  const FS = t.font_size;
  const w = 1920;
  const h = BH;
  const durPerLang = 45;

  function buildText(articles, lang) {
    return articles.map(a => {
      return lang === "ar"
        ? escapeHtml(a.ar)
        : lang === "fr"
          ? escapeHtml(a.fr || a.ar)
          : escapeHtml(a.en || a.ar);
    }).join(sep);
  }

  const textAr = buildText(articles, "ar");
  const textFr = buildText(articles, "fr");
  const textEn = buildText(articles, "en");

  const total = durPerLang * 3;
  const startFr = durPerLang;
  const startEn = durPerLang * 2;

  const scrollDist = w * 2;

  return {
    html: `<!doctype html>
<html lang="ar">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${w}, height=${h}" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: transparent; }
      #root { width: ${w}px; height: ${h}px; position: relative; background: linear-gradient(90deg, rgba(10,22,40,0.98) 0%, rgba(20,35,65,0.98) 50%, rgba(10,22,40,0.98) 100%); overflow: hidden; }
      .clip { position: absolute; }
      .band { position: absolute; top: 0; left: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
      .scroll { position: absolute; top: 0; height: ${h}px; white-space: nowrap; display: flex; align-items: center; font-size: ${FS}px; color: #fff; font-weight: 400; }
      .scroll.ar { direction: ltr; left: 0; font-family: 'Noto Sans Arabic', sans-serif; }
      .scroll.fr, .scroll.en { direction: rtl; right: 0; font-family: 'Roboto', sans-serif; }
      .sep { color: rgba(255,255,255,0.3); margin: 0 12px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${w}" data-height="${h}">

      <div id="band-ar" class="band clip" data-start="0" data-duration="${durPerLang}" data-track-index="0" style="z-index:3">
        <div id="scroll-ar" class="scroll ar">${textAr}</div>
      </div>

      <div id="band-fr" class="band clip" data-start="${startFr}" data-duration="${durPerLang}" data-track-index="1" style="z-index:2">
        <div id="scroll-fr" class="scroll fr">${textFr}</div>
      </div>

      <div id="band-en" class="band clip" data-start="${startEn}" data-duration="${durPerLang}" data-track-index="2" style="z-index:1">
        <div id="scroll-en" class="scroll en">${textEn}</div>
      </div>

    </div>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      tl.to("#scroll-ar", { x: ${scrollDist}, duration: ${durPerLang}, ease: "none" }, 0);
      tl.to("#scroll-fr", { x: -${scrollDist}, duration: ${durPerLang}, ease: "none" }, ${startFr});
      tl.to("#scroll-en", { x: -${scrollDist}, duration: ${durPerLang}, ease: "none" }, ${startEn});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`,
    totalDuration: total,
  };
}

async function main() {
  console.log("\n=== BANDE NEWS — BANDE DÉFILANTE 3 LANGUES ===\n");
  const vidConfig = config.video;
  if (!vidConfig) throw new Error("Section 'video' manquante dans config.json");

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("1/3 Attente du serveur API...");
  await waitForServer();

  console.log("2/3 Récupération des articles et traduction...");
  const allData = await fetchJson(`${API_BASE}/api/fetch-all?limit=10`);
  const articlesByCategory = allData.categories;
  console.log(`   ${allData.total} articles récupérés`);

  const articlesToTranslate = [];
  for (const catKey of vidConfig.categories_order) {
    const articles = articlesByCategory[catKey] || [];
    for (const article of articles.slice(0, vidConfig.items_per_category)) {
      articlesToTranslate.push(article);
    }
  }

  if (articlesToTranslate.length > 0) {
    const texts = articlesToTranslate.map(a => a.title);
    let translationsFr = [];
    let translationsEn = [];
    try {
      const resFr = await fetch(`${API_BASE}/api/translate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, target_lang: "fr" }),
      });
      translationsFr = (await resFr.json()).translations || [];
      const resEn = await fetch(`${API_BASE}/api/translate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, target_lang: "en" }),
      });
      translationsEn = (await resEn.json()).translations || [];
    } catch (e) {
      console.log(`   Traduction indisponible (${e.message})`);
    }
    for (let i = 0; i < articlesToTranslate.length; i++) {
      articlesToTranslate[i].title_fr = translationsFr[i] || "";
      articlesToTranslate[i].title_en = translationsEn[i] || "";
    }
    console.log(`   ${texts.length} titres traduits`);
  }

  const articles = buildArticlesList(articlesByCategory, vidConfig);
  console.log(`   ${articles.length} articles sélectionnés`);

  console.log("3/3 Génération HTML et rendu vidéo...");
  const { html, totalDuration } = generateBandHtml(articles, vidConfig);
  const htmlPath = resolve(HF_DIR, "index.html");
  writeFileSync(htmlPath, html, "utf-8");
  console.log(`   Durée: ${totalDuration}s (3 × ${totalDuration/3}s par langue)`);

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
  const videoPath = resolve(OUTPUT_DIR, `bande-news_${ts}.mp4`);

  console.log(`\n   Lancement du rendu...`);
  execSync(`npx hyperframes render --output "${videoPath}"`, {
    cwd: HF_DIR, stdio: "inherit", timeout: 600000,
  });

  console.log(`\n=== TERMINÉ ===`);
  console.log(`   Vidéo: ${videoPath}`);
  console.log(`   ${articles.length} articles · Arabe (G>D) · Français (D>G) · Anglais (D>G)`);
  console.log(`   Pour OBS: source Media, boucle activée\n`);
}

main().catch(err => { console.error(`\nERREUR: ${err.message}`); process.exit(1); });
