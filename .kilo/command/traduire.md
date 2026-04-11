---
description: Traduire la derniere collecte AR en FR et EN et generer le document final
---

# Traduction de la collecte Bande News

## Etapes

1. Trouve le fichier JSON le plus recent dans `output/` (pattern: `collecte_*.json`). Si aucun fichier, demande a l'utilisateur de d'abord lancer `npm run collect`.

2. Lis le fichier JSON. Il contient un tableau `articles` avec des objets ayant un champ `ar` (titre arabe).

3. Pour CHAQUE article, traduis le titre arabe (`ar`) en francais et en anglais. Produis un tableau avec les champs `ar`, `fr`, `en` pour chaque article.

Regles de traduction:
- Traduis le titre de facon fidele et journalistique
- Conserve les noms propres en arabe, francais et anglais de maniere coherente
- Les titres FR doivent suivre les conventions de la presse marocaine francophone (style MAP)
- Les titres EN doivent suivre les conventions de la presse anglophone

4. Genere le document final au format texte dans `output/` avec le nom `bande-news_[date].txt`:

Le document doit suivre EXACTEMENT ce format:

```
[ titre 1 arabe ]
§
[ titre 2 arabe ]
§
...
[ titre N arabe ]
§

[ titre 1 francais ]
§
[ titre 2 francais ]
§
...
[ titre N francais ]
§

[ titre 1 anglais ]
§
[ titre 2 anglais ]
§
...
[ titre N anglais ]
§
```

Important:
- Les 3 sections (AR puis FR puis EN) doivent avoir EXACTEMENT le meme nombre de titres
- Les titres sont separees par §
- Chaque section se termine par §
- Les sections sont separees par une ligne vide
- L'ordre des articles doit etre identique dans les 3 sections

5. Sauvegarde aussi un fichier JSON `bande-news_[date].json` avec la structure:
```json
{
  "metadata": { "source": "mapnews.ma", "collect_date": "...", "total_articles": N },
  "articles": [
    { "id": 1, "ar": "...", "fr": "...", "en": "..." }
  ]
}
```

6. Affiche le contenu complet du fichier .txt genere pour que l'utilisateur puisse le copier.
