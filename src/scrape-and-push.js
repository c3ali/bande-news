const REMOTE_URL = process.env.REMOTE_URL || "";
const LIMIT = 20;

async function scrapeAll() {
  const { default: config } = await import("../config.json", { assert: { type: "json" } });
  const categories = {};
  const errors = [];

  for (const [catKey, cat] of Object.entries(config.categories)) {
    console.log(`📡 ${cat.label_fr}...`);
    try {
      const url = `${config.base_url}${cat.url}`;
      const headers = {
        "User-Agent": config.user_agent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.7,fr;q=0.5",
      };

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const articles = parseArticles(html, catKey);
      console.log(`   ✓ ${articles.length} articles (page 1)`);

      if (articles.length < LIMIT) {
        for (let page = 1; page <= 4; page++) {
          if (articles.length >= LIMIT) break;
          await new Promise(r => setTimeout(r, 1500));
          try {
            const pr = await fetch(`${url}?page=${page}`, { headers });
            if (!pr.ok) break;
            const ph = await pr.text();
            const pa = parseArticles(ph, catKey);
            if (!pa.length) break;
            const seen = new Set(articles.map(a => a.title));
            pa.forEach(a => { if (!seen.has(a.title)) articles.push(a); });
            console.log(`   ✓ ${articles.length} articles (page ${page + 1})`);
          } catch { break; }
        }
      }

      categories[catKey] = articles.slice(0, LIMIT).map((a, i) => ({
        id: i + 1,
        title: a.title,
        date: a.date,
        category: catKey,
        category_label: cat.label,
        category_label_fr: cat.label_fr,
      }));
    } catch (err) {
      errors.push({ category: catKey, error: err.message });
      categories[catKey] = [];
      console.log(`   ✗ ${err.message}`);
    }
  }

  return { categories, errors };
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&amp;/gi, "&")
    .replace(/&#039;/gi, "'").replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

const TITMIMA = "\u062A\u0640\u062A\u0640\u0645\u0640\u0629";

function parseArticles(html, catKey) {
  const articles = [];
  const seen = new Set();

  const add = (title, date) => {
    const clean = decodeHtmlEntities(title).replace(/\s+/g, " ").trim();
    if (clean.length < 10 || clean === TITMIMA || seen.has(clean)) return;
    seen.add(clean);
    articles.push({ title: clean, date });
  };

  if (catKey === "activites_royales") {
    const rows = html.split(/<div class="element_over_hidden views-row/);
    for (const row of rows) {
      const tm = row.match(/page_second_title[^>]*><a href="\/ar\/activites-royales\/[^"]+">([^<]+)<\/a>/);
      if (!tm) continue;
      const dm = row.match(/<div class="field-content node-date">([^<]+)<\/div>/);
      add(tm[1], dm ? dm[1].trim() : "");
    }
  } else {
    const blocks = html.split(/<div class="block-1">/);
    for (const block of blocks) {
      const tm = block.match(/<span class="field-content"><a href="\/ar\/actualites\/[^"]+">([^<]+)<\/a><\/span>/);
      if (!tm) continue;
      const dm = block.match(/<div class="field-content date-actualites">([^<]+)<\/div>/);
      add(tm[1], dm ? dm[1].trim() : "");
    }
  }

  return articles;
}

async function uploadToRemote(categories) {
  if (!REMOTE_URL) {
    console.log("\n⚠️  REMOTE_URL non défini. Export local uniquement.");
    console.log("   Pour uploader: REMOTE_URL=https://votre-serveur.com npm run push\n");
    return false;
  }

  const url = `${REMOTE_URL.replace(/\/$/, "")}/api/import`;
  console.log(`\n📤 Upload vers ${url}...`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories }),
    });
    const data = await res.json();
    if (data.success) {
      console.log(`✅ ${data.total} articles importés (${data.filename})`);
      return true;
    }
    console.log(`✗ Erreur: ${data.error}`);
    return false;
  } catch (err) {
    console.log(`✗ Upload échoué: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("═".repeat(60));
  console.log("  📰 BANDE NEWS — Scraping local + push serveur");
  console.log("═".repeat(60) + "\n");

  const { categories, errors } = await scrapeAll();

  const total = Object.values(categories).reduce((s, a) => s + a.length, 0);
  console.log(`\n📊 Total: ${total} articles`);
  if (errors.length) console.log(`⚠️  Erreurs: ${errors.map(e => e.category).join(", ")}`);

  if (total === 0) {
    console.log("\n❌ Aucun article récupéré. Abandon.");
    process.exit(1);
  }

  for (const [catKey, arts] of Object.entries(categories)) {
    console.log(`\n--- ${arts[0]?.category_label_fr || catKey} (${arts.length}) ---`);
    arts.forEach(a => console.log(`  ${a.id}. [${a.date || "—"}] ${a.title.substring(0, 70)}`));
  }

  if (REMOTE_URL) {
    await uploadToRemote(categories);
  } else {
    const { writeFileSync, mkdirSync, existsSync } = await import("fs");
    const { resolve } = await import("path");
    const outputDir = resolve(import.meta.dirname, "../output");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filepath = resolve(outputDir, `collecte_${ts}.json`);
    writeFileSync(filepath, JSON.stringify({ categories }, null, 2), "utf-8");
    console.log(`\n💾 Sauvegardé: ${filepath}`);
    console.log("   Pour uploader: REMOTE_URL=https://votre-serveur.com npm run push");
  }

  console.log("\n" + "═".repeat(60));
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
