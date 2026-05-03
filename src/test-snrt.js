import { fetchSnrtNews } from "./snrt-fetcher.js";

async function main() {
  console.log("═".repeat(90));
  console.log("  🧪 TEST — SNRTnews Collector");
  console.log("═".repeat(90));

  try {
    const articles = await fetchSnrtNews("all", 50);

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

    console.log(`\n✅ Total: ${articles.length} articles`);
    console.log(`   Catégories: ${Object.keys(byCategory).length}`);
    console.log("\n" + "═".repeat(90) + "\n");
  } catch (error) {
    console.error("\n❌ Erreur:", error.message);
    process.exit(1);
  }
}

main();