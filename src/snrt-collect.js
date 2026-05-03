import { fetchSnrtNews } from "./snrt-fetcher.js";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("═".repeat(90));
  console.log("  📰 BANDE NEWS — Collecte SNRTnews (arabe)");
  console.log("  ⚡ Exécutez ce script depuis votre PC local");
  console.log("═".repeat(90));

  try {
    const articles = await fetchSnrtNews("all", 100);

    if (articles.length === 0) {
      console.log("\n⚠️  Aucun article trouvé.");
      return;
    }

    const byCategory = {};
    for (const a of articles) {
      if (!byCategory[a.category]) byCategory[a.category] = [];
      byCategory[a.category].push(a);
    }

    console.log("\n📊 Résultats par catégorie :\n");
    for (const [cat, arts] of Object.entries(byCategory)) {
      console.log(`  ── ${cat} (${arts.length}) ──`);
      arts.forEach(a => console.log(`     ${a.id}. [${a.date}] ${a.title.substring(0, 80)}`));
      console.log();
    }

    const output = {
      metadata: {
        source: "SNRTnews",
        collect_date: new Date().toISOString(),
        total_articles: articles.length,
        categories: Object.keys(byCategory).length,
      },
      articles: articles,
    };

    const outputDir = resolve(__dirname, "../output");
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filepath = resolve(outputDir, `snrtnews_${ts}.json`);

    writeFileSync(filepath, JSON.stringify(output, null, 2), "utf-8");

    console.log(`\n✅ Total: ${articles.length} articles sur ${Object.keys(byCategory).length} catégories`);
    console.log(`💾 Sauvegardé: ${filepath}`);
    console.log("═".repeat(90) + "\n");
  } catch (error) {
    console.error("\n❌ Erreur:", error.message);
    process.exit(1);
  }
}

main();