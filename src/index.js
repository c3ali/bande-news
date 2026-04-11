import { fetchNews } from "./fetcher.js";
import { selectArticles, editArticles, previewAndConfirm } from "./selector.js";
import { saveJson } from "./formatter.js";

async function main() {
  console.log("═".repeat(90));
  console.log("  📰 BANDE NEWS — Collecte mapnews.ma (arabe)");
  console.log("═".repeat(90));

  try {
    const articles = await fetchNews();

    if (articles.length === 0) {
      console.log("\n⚠️  Aucun article disponible.");
      return;
    }

    articles.forEach((a) => console.log(`  ${a.id}. ${a.title}`));

    const selected = await selectArticles(articles);
    if (selected.length === 0) return;

    const edited = await editArticles(selected);
    if (edited.length === 0) {
      console.log("\n⚠️  Aucun article restant.");
      return;
    }

    const confirmed = await previewAndConfirm(edited);
    if (!confirmed) {
      console.log("\n❌ Annule.");
      return;
    }

    const filepath = saveJson(edited);
    console.log("═".repeat(90));
    console.log("  ✅ Termine ! Lancez /traduire pour generer FR + EN");
    console.log("═".repeat(90) + "\n");
  } catch (error) {
    console.error("\n❌ Erreur:", error.message);
    process.exit(1);
  }
}

main();
