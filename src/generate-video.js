import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, "../config.json"), "utf-8"));
const API_BASE = "http://localhost:3002";
const HF_DIR = resolve(__dirname, "../bande-news-video");
const OUTPUT_DIR = resolve(HF_DIR, "videos");
const STATUS_FILE = resolve(HF_DIR, "render-status.json");

function writeStatus(phase, percent, message, videoPath = null, durations = null) {
  const status = { phase, percent: Math.min(100, Math.max(0, percent)), message, ts: Date.now() };
  if (videoPath) status.videoPath = videoPath;
  if (durations) status.durations = durations;
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), "utf-8");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(maxRetries = 10) {
  writeStatus("waiting-server", 5, "Attente du serveur API...");
  for (let i = 0; i < maxRetries; i++) {
    try { await fetchJson(`${API_BASE}/api/categories`); return true; } catch {
      writeStatus("waiting-server", 5 + Math.round((i / maxRetries) * 10), `Attente du serveur... (${i + 1}/${maxRetries})`);
      await sleep(2000);
    }
  }
  throw new Error("Serveur API indisponible. Lance d'abord: npm run server");
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, " ");
}

function buildArticlesList(articlesByCategory, vidConfig) {
  const perCat = vidConfig.items_per_category;
  const order = vidConfig.categories_order || [];
  const articles = [];
  for (const catKey of order) {
    const items = (articlesByCategory[catKey] || []).slice(0, perCat);
    for (const article of items) {
      articles.push({
        ar: article.title,
        fr: article.title_fr || "",
        en: article.title_en || "",
      });
    }
  }
  // Aucun article dans les categories attendues ? (selection manuelle dans
  // l'interface, imports, categories SNRT...) On garde tout ce qui est
  // disponible, dans l'ordre naturel des categories.
  if (articles.length === 0) {
    for (const items of Object.values(articlesByCategory)) {
      for (const article of items) {
        if (article && article.title && article.title.length > 3) {
          articles.push({
            ar: article.title,
            fr: article.title_fr || "",
            en: article.title_en || "",
          });
        }
      }
    }
  }
  return articles;
}

function estimateTextWidth(text, fontSize, isArabic) {
  const avgCharWidth = isArabic ? fontSize * 0.5 : fontSize * 0.55;
  return Math.ceil(text.length * avgCharWidth);
}

function generateBandHtml(articles, vidConfig) {
  const t = vidConfig.ticker;
  const sep = t.separator;
  const BH = t.band_height;
  const FS = t.font_size;
  const w = 1920;
  const h = BH;
  const speed = t.pixels_per_second || 120;
  const gap = t.gap_between_languages || 1;

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

  const dupAr = textAr + sep + textAr;
  const dupFr = textFr + sep + textFr;
  const dupEn = textEn + sep + textEn;

  const widthAr = estimateTextWidth(textAr, FS, true);
  const widthFr = estimateTextWidth(textFr, FS, false);
  const widthEn = estimateTextWidth(textEn, FS, false);

  const sepWidthAr = estimateTextWidth(sep, FS, true);
  const sepWidthFr = estimateTextWidth(sep, FS, false);
  const sepWidthEn = estimateTextWidth(sep, FS, false);

  const durAr = Math.max(30, Math.round(widthAr / speed));
  const durFr = Math.max(30, Math.round(widthFr / speed));
  const durEn = Math.max(30, Math.round(widthEn / speed));

  const startFr = durAr + gap;
  const startEn = startFr + durFr + gap;
  const total = startEn + durEn;

  const arXStart = -(widthAr + sepWidthAr);
  const arXEnd   = 0;

  const frXStart = w;
  const frXEnd   = w - (widthFr + sepWidthFr);

  const enXStart = w;
  const enXEnd   = w - (widthEn + sepWidthEn);

  return {
    html: `<!doctype html>
<html lang="ar">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${w}, height=${h}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400&family=Roboto:wght@400&display=swap" rel="stylesheet" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: transparent; }
      #root { width: ${w}px; height: ${h}px; position: relative; background: #333333; overflow: hidden; }
      .clip { position: absolute; }
      .band { position: absolute; top: 0; left: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
      .scroll { position: absolute; top: 0; left: 0; height: ${h}px; line-height: ${h}px; font-size: ${FS}px; color: #fff; font-weight: 400; white-space: nowrap; }
      .scroll.ar { font-family: 'Noto Sans Arabic', sans-serif; }
      .scroll.fr, .scroll.en { font-family: 'Roboto', sans-serif; }
      .inner { display: inline-block; white-space: nowrap; width: max-content; }
      .sep { color: rgba(255,255,255,0.3); margin: 0 12px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${w}" data-height="${h}">

      <div id="band-ar" class="band clip" data-start="0" data-duration="${durAr}" data-track-index="0" style="z-index:3">
        <div id="scroll-ar" class="scroll ar"><div class="inner">${dupAr}</div></div>
      </div>

      <div id="band-fr" class="band clip" data-start="${startFr}" data-duration="${durFr}" data-track-index="1" style="z-index:2">
        <div id="scroll-fr" class="scroll fr"><div class="inner">${dupFr}</div></div>
      </div>

      <div id="band-en" class="band clip" data-start="${startEn}" data-duration="${durEn}" data-track-index="2" style="z-index:1">
        <div id="scroll-en" class="scroll en"><div class="inner">${dupEn}</div></div>
      </div>

    </div>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      tl.fromTo("#scroll-ar .inner", { x: ${arXStart} }, { x: ${arXEnd}, duration: ${durAr}, ease: "none" }, 0);
      tl.fromTo("#scroll-fr .inner", { x: ${frXStart} }, { x: ${frXEnd}, duration: ${durFr}, ease: "none" }, ${startFr});
      tl.fromTo("#scroll-en .inner", { x: ${enXStart} }, { x: ${enXEnd}, duration: ${durEn}, ease: "none" }, ${startEn});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`,
    totalDuration: total,
    durations: { ar: durAr, fr: durFr, en: durEn },
    widths: { ar: widthAr, fr: widthFr, en: widthEn },
  };
}

function renderVideo(videoPath) {
  return new Promise((resolve, reject) => {
    writeStatus("rendering", 20, "Compilation de la composition...");

    const isWin = process.platform === "win32";
    const cmd = isWin ? "cmd" : "npx";
    const args = isWin
      ? ["/c", "npx", "hyperframes@0.4.42", "render", "--output", videoPath, "-w", "1"]
      : ["hyperframes@0.4.42", "render", "--output", videoPath, "-w", "1"];

    const child = spawn(cmd, args, { cwd: HF_DIR, timeout: 600000 });

    let stdout = "";
    let lastPercent = 20;

    child.stdout.on("data", (data) => {
      stdout += data.toString();
      const m = stdout.match(/(\d+)%/g);
      if (m && m.length > 0) {
        const p = parseInt(m[m.length - 1]);
        if (p !== lastPercent) {
          lastPercent = p;
          writeStatus("rendering", 20 + Math.round(p * 0.75), `Rendu vidéo ${p}%`);
        }
      }
    });

    child.stderr.on("data", (data) => {
      // stderr ignored
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Render failed with code ${code}`));
      }
    });

    child.on("error", (err) => reject(err));
  });
}

async function main() {
  writeStatus("starting", 0, "Démarrage de la génération...");

  const vidConfig = config.video;
  if (!vidConfig) throw new Error("Section 'video' manquante dans config.json");

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  writeStatus("waiting-server", 5, "Connexion au serveur API...");
  await waitForServer();

  writeStatus("loading-articles", 15, "Chargement des articles...");
  let articlesByCategory = {};

  // Check if selected articles were provided via the web UI
  const selectedFile = resolve(HF_DIR, "selected-articles.json");
  if (existsSync(selectedFile)) {
    try {
      const selectedData = JSON.parse(readFileSync(selectedFile, "utf-8"));
      if (selectedData.articles && Array.isArray(selectedData.articles)) {
        // Group articles by category_key
        articlesByCategory = {};
        for (const a of selectedData.articles) {
          const catKey = a.category_key || "general";
          if (!articlesByCategory[catKey]) articlesByCategory[catKey] = [];
          articlesByCategory[catKey].push({
            id: articlesByCategory[catKey].length + 1,
            title: a.ar || a.title || "",
            title_fr: a.fr || "",
            title_en: a.en || "",
            date: a.date || "",
            category: catKey,
            category_label: a.category || catKey,
            category_label_fr: a.category || catKey,
          });
        }
        console.log(`   ${selectedData.articles.length} articles chargés depuis la sélection`);
      }
        // Clean up so we don't reuse it accidentally
        try { unlinkSync(selectedFile); } catch {}
    } catch (e) {
      console.log(`   Impossible de lire selected-articles.json: ${e.message}`);
    }
  }

  // Fallback: load from cache or API if no selected articles
  let totalCached = 0;
  for (const cat of Object.values(articlesByCategory)) { totalCached += (cat || []).length; }
  if (totalCached === 0) {
    const outputDir = resolve(__dirname, "../output");
    const cachedFiles = existsSync(outputDir) ? readdirSync(outputDir).filter(f => f.startsWith("collecte_") && f.endsWith(".json")).sort().reverse() : [];
    if (cachedFiles.length > 0) {
      const cachedData = JSON.parse(readFileSync(resolve(outputDir, cachedFiles[0]), "utf-8"));
      if (cachedData.categories && Object.keys(cachedData.categories).length > 0) {
        articlesByCategory = cachedData.categories;
      } else if (cachedData.articles && Array.isArray(cachedData.articles)) {
        for (const a of cachedData.articles) {
          const catKey = a.category_key || "general";
          if (!articlesByCategory[catKey]) articlesByCategory[catKey] = [];
          articlesByCategory[catKey].push({
            id: articlesByCategory[catKey].length + 1,
            title: a.ar || a.title || "",
            title_fr: a.fr || "",
            title_en: a.en || "",
            date: a.date || "",
            category: catKey,
            category_label: a.category || catKey,
            category_label_fr: a.category || catKey,
          });
        }
      }
    }
    let total = 0;
    for (const cat of Object.values(articlesByCategory)) { total += (cat || []).length; }
    console.log(`   ${total} articles chargés depuis le cache`);
    if (total === 0) {
      console.log("   Cache vide, appel API /api/fetch-all...");
      const allData = await fetchJson(`${API_BASE}/api/fetch-all?limit=10`);
      articlesByCategory = (allData && allData.categories) ? allData.categories : {};
      if (!articlesByCategory || Object.keys(articlesByCategory).length === 0) {
        throw new Error("L'API n'a retourné aucun article (collecte impossible).");
      }
      for (const cat of Object.values(articlesByCategory)) { total += (cat || []).length; }
      console.log(`   ${total} articles chargés depuis l'API`);
    }
  }

  const articlesToTranslate = [];
  for (const catKey of vidConfig.categories_order) {
    const articles = articlesByCategory[catKey] || [];
    for (const article of articles.slice(0, vidConfig.items_per_category)) {
      if (article.title && article.title.length > 3) {
        articlesToTranslate.push(article);
      }
    }
  }
  console.log(`   ${articlesToTranslate.length} articles à traduire`);

  if (articlesToTranslate.length > 0) {
    writeStatus("translating", 18, "Traduction des titres (FR + EN)...");
    const texts = articlesToTranslate.map(a => a.title);
    const NANO_GPT_KEY = "sk-nano-2f59fd96-db79-4601-bb68-c89bbe178482";
    const NANO_GPT_MODEL = "google/gemma-4-31b-it";

    async function tryTranslateWithCredits(texts, targetLang) {
      const langName = targetLang === "fr" ? "French" : "English";
      const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
      const abbrevRule = targetLang === "fr"
        ? 'Never spell out "Sa Majesté": always use the abbreviation "SM" (e.g. "SM le Roi Mohammed VI").'
        : 'Never spell out "His Majesty": always use the abbreviation "HM" (e.g. "HM King Mohammed VI").';
      const prompt = `Translate each of the following Arabic news headlines to ${langName}. Keep the numbering. Output ONLY the translations, one per line, numbered. Do not add any explanation. ${abbrevRule}\n\n${numbered}`;

      const res = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${NANO_GPT_KEY}`,
          "X-Billing-Mode": "paygo",
        },
        body: JSON.stringify({ model: NANO_GPT_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.1 }),
      });
      if (!res.ok) throw new Error(`NanoGPT paygo failed ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    }

    async function translateTexts(texts, targetLang) {
      const langName = targetLang === "fr" ? "French" : "English";
      const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
      const abbrevRule = targetLang === "fr"
        ? 'Never spell out "Sa Majesté": always use the abbreviation "SM" (e.g. "SM le Roi Mohammed VI").'
        : 'Never spell out "His Majesty": always use the abbreviation "HM" (e.g. "HM King Mohammed VI").';
      const prompt = `Translate each of the following Arabic news headlines to ${langName}. Keep the numbering. Output ONLY the translations, one per line, numbered. Do not add any explanation. ${abbrevRule}\n\n${numbered}`;
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
          const content = await tryTranslateWithCredits(texts, targetLang);
          return content.split("\n").map(l => l.replace(/^\d+[\.\)\-]\s*/, "").trim()).filter(l => l.length > 0);
        }
        throw new Error(`NanoGPT ${res.status}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      return content.split("\n").map(l => l.replace(/^\d+[\.\)\-]\s*/, "").trim()).filter(l => l.length > 0);
    }

    let translationsFr = [];
    let translationsEn = [];
    let translateError = null;
    try {
      translationsFr = await translateTexts(texts, "fr");
      translationsEn = await translateTexts(texts, "en");
    } catch (e) {
      translateError = e.message;
      console.log(`   Traduction indisponible (${e.message}) — utilisation des originaux`);
    }
    for (let i = 0; i < articlesToTranslate.length; i++) {
      articlesToTranslate[i].title_fr = (translationsFr[i] && translationsFr[i].length > 3) ? translationsFr[i] : articlesToTranslate[i].title;
      articlesToTranslate[i].title_en = (translationsEn[i] && translationsEn[i].length > 3) ? translationsEn[i] : articlesToTranslate[i].title;
    }
    if (translateError) {
      console.log(`   Fallback: titres originaux utilisés pour ${articlesToTranslate.length} articles`);
    }
  } else {
    console.log(`   Aucun article à traduire (${articlesToTranslate.length} articles)`);
  }

  const articles = buildArticlesList(articlesByCategory, vidConfig);
  if (articles.length === 0 || articles.every(a => !a.ar && !a.fr && !a.en)) {
    throw new Error("Aucun article avec contenu trouvé. Vérifiez que les articles sont chargés.");
  }
  console.log(`   ${articles.length} articles dans la bande (AR=${articles.filter(a=>a.ar).length} FR=${articles.filter(a=>a.fr).length} EN=${articles.filter(a=>a.en).length})`);

  writeStatus("generating-html", 19, "Génération de la composition HTML...");
  const { html, totalDuration, durations, widths } = generateBandHtml(articles, vidConfig);
  const htmlPath = resolve(HF_DIR, "index.html");
  writeFileSync(htmlPath, html, "utf-8");

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
  const videoPath = resolve(OUTPUT_DIR, `bande-news_${ts}.mp4`);

  writeStatus("rendering", 20, "Lancement du rendu vidéo...");
  await renderVideo(videoPath);

  writeStatus("completed", 100, "Vidéo générée avec succès", videoPath.replace(/\\/g, "/").replace(/^.*\//, ""), durations);
}

main().catch(err => {
  console.error(`\nERREUR: ${err.message}`);
  writeStatus("error", 0, `Erreur: ${err.message}`);
  process.exit(1);
});
