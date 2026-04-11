import inquirer from "inquirer";

export async function selectArticles(articles) {
  console.log("\n" + "═".repeat(90));
  console.log("  📋 SELECTION DES ARTICLES A GARDER");
  console.log("═".repeat(90) + "\n");

  const choices = articles.map((article) => ({
    name: `${article.id}. ${article.title}`,
    value: article.id,
    short: article.title.substring(0, 50) + "...",
  }));

  const { selectedIds } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedIds",
      message: "Cochez les articles (Espace = selectionner, Entree = valider):",
      choices,
      loop: false,
      pageSize: 20,
    },
  ]);

  if (selectedIds.length === 0) {
    console.log("\n⚠️  Aucun article selectionne.");
    return [];
  }

  return articles.filter((a) => selectedIds.includes(a.id));
}

export async function editArticles(selectedArticles) {
  console.log("\n" + "═".repeat(90));
  console.log("  ✏️  EDITION DES TITRES");
  console.log("═".repeat(90) + "\n");

  const edited = [];

  for (const article of selectedArticles) {
    console.log(`  ${article.id}. ${article.title}\n`);

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: `Article ${article.id}:`,
        choices: [
          { name: "✅ Garder tel quel", value: "keep" },
          { name: "✏️  Modifier", value: "edit" },
          { name: "❌ Supprimer", value: "remove" },
        ],
      },
    ]);

    if (action === "remove") {
      console.log("  ❌ Supprime.\n");
      continue;
    }

    if (action === "edit") {
      const { newTitle } = await inquirer.prompt([
        {
          type: "input",
          name: "newTitle",
          message: "Nouveau titre:",
          default: article.title,
        },
      ]);
      edited.push({ ...article, title: newTitle });
    } else {
      edited.push(article);
    }

    console.log();
  }

  return edited;
}

export async function previewAndConfirm(articles) {
  console.log("\n" + "═".repeat(90));
  console.log("  📄 APERCU — TITRES SELECTIONNES");
  console.log("═".repeat(90) + "\n");

  articles.forEach((a) => console.log(`  ${a.id}. ${a.title}`));
  console.log(`\n  Total: ${articles.length} article(s)\n`);

  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: "Confirmer et sauvegarder ?",
      default: true,
    },
  ]);

  return confirmed;
}
