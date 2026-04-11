import { writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function formatDateForFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function saveJson(articles, outputDir = "./output") {
  const outputDirAbs = resolve(__dirname, "..", outputDir);

  if (!existsSync(outputDirAbs)) {
    mkdirSync(outputDirAbs, { recursive: true });
  }

  const timestamp = formatDateForFilename();
  const filename = `collecte_${timestamp}.json`;
  const filepath = resolve(outputDirAbs, filename);

  const output = {
    metadata: {
      source: "mapnews.ma",
      collect_date: new Date().toISOString(),
      total_articles: articles.length,
    },
    articles: articles.map((a) => ({
      id: a.id,
      ar: a.title,
      date: a.date,
    })),
  };

  writeFileSync(filepath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✅ Sauvegarde: ${filepath}`);
  console.log(`   ${articles.length} article(s)\n`);

  return filepath;
}

export function getLatestCollectePath(outputDir = "./output") {
  const outputDirAbs = resolve(__dirname, "..", outputDir);
  if (!existsSync(outputDirAbs)) return null;

  const files = readdirSync(outputDirAbs)
    .filter((f) => f.startsWith("collecte_") && f.endsWith(".json"))
    .sort()
    .reverse();

  return files.length > 0 ? resolve(outputDirAbs, files[0]) : null;
}
