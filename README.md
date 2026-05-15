# Suivi EPI — Matériel d'escalade

Application web statique pour le suivi des contrôles annuels de sécurité (EPI) du matériel d'escalade. Aucune dépendance externe, aucun serveur requis — ouvrez simplement `index.html` dans un navigateur.

---

## Fonctionnalités

- **Chargement d'un fichier JSON** depuis le système de fichiers local
- **Tableau de l'inventaire** avec toutes les informations produit
- **Colonne Statut EPI** indiquant si le contrôle annuel a été effectué
- **Fiche détail** par produit : historique complet des contrôles EPI
- **Ajout de contrôles EPI** via une modale (date, contrôleur, résultat, remarques)
- **Ajout de nouveaux produits** directement depuis l'interface
- **Sauvegarde automatique** dans le fichier JSON source
- **Tri** sur toutes les colonnes, **recherche** en temps réel
- Entièrement en **français**

---

## Démarrage rapide

1. Cloner ou télécharger ce dépôt
2. Ouvrir `index.html` dans un navigateur moderne
3. Cliquer sur **Charger un fichier JSON** et sélectionner votre fichier (ou utiliser `sample-products.json` pour tester)

Aucune installation, aucun build, aucun serveur nécessaire.

---

## Compatibilité navigateurs et sauvegarde

| Navigateur | Sauvegarde |
|---|---|
| Chrome, Edge | ✅ Sauvegarde directe dans le fichier source (File System Access API) |
| Firefox, Safari | ⬇️ Téléchargement du fichier mis à jour après chaque modification |

> **Brave** désactive la File System Access API pour des raisons de confidentialité, même si son moteur est basé sur Chromium. Un bandeau d'information s'affiche automatiquement dans ce cas.

---

## Format du fichier JSON

Le fichier JSON doit contenir un tableau d'objets. Exemple :

```json
[
  {
    "productName": "Grigri+",
    "manufacturer": "Petzl",
    "productType": "Assureur",
    "description": "Assureur à blocage assisté avec poignée anti-panique.",
    "buyingDate": "2022-09-14",
    "lifetime": 10,
    "epiChecks": [
      {
        "date": "2024-10-05",
        "inspector": "Alice Martin",
        "result": "pass",
        "notes": "Aucune anomalie détectée."
      }
    ]
  }
]
```

### Champs produit

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `productName` | `string` | ✅ | Nom du produit |
| `manufacturer` | `string` | ✅ | Fabricant |
| `productType` | `string` | ✅ | Type de produit (Baudrier, Corde…) |
| `description` | `string` | — | Description libre |
| `buyingDate` | `string` | ✅ | Date d'achat au format `YYYY-MM-DD` |
| `lifetime` | `integer` | ✅ | Durée de vie en **années** — `0` = illimité |
| `epiChecks` | `array` | — | Liste des contrôles EPI (peut être vide `[]`) |

### Champs d'un contrôle EPI

| Champ | Type | Description |
|---|---|---|
| `date` | `string` | Date du contrôle `YYYY-MM-DD` |
| `inspector` | `string` | Nom du contrôleur |
| `result` | `string` | `"pass"` ou `"fail"` |
| `notes` | `string` | Remarques libres (facultatif) |

---

## Structure du projet

```
epi_follow/
├── index.html           # Application (vue liste + vue détail + modales)
├── style.css            # Styles
├── app.js               # Logique applicative (Vanilla JS, sans dépendance)
├── sample-products.json # Données d'exemple
└── README.md
```

---

## Statut EPI

L'application calcule automatiquement le statut EPI de chaque produit pour l'année en cours :

| Badge | Signification |
|---|---|
| ✓ Contrôlé en AAAA | Au moins un contrôle enregistré cette année |
| ⚠ Contrôle requis | Des contrôles existent, mais aucun cette année |
| — Aucun contrôle | Aucun contrôle n'a jamais été enregistré |

La date d'expiration (date d'achat + durée de vie) est colorée :

| Couleur | Signification |
|---|---|
| 🟢 Vert | Dans les délais |
| 🟡 Jaune | Expire dans moins de 30 jours |
| 🔴 Rouge | Expiré |
