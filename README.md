# Suivi EPI — Matériel d'escalade

Application web pour le suivi des contrôles annuels de sécurité (EPI) du matériel d'escalade. Les données sont stockées dans une base SQLite via une API Node.js et peuvent être lancées avec Docker.

---

## Fonctionnalités

- **Chargement automatique** des produits depuis la base de données
- **Tableau de l'inventaire** avec toutes les informations produit
- **Colonne Statut EPI** indiquant si le contrôle annuel a été effectué
- **Fiche détail** par produit : historique complet des contrôles EPI
- **Ajout de contrôles EPI** via une modale (date, contrôleur, résultat, remarques)
- **Ajout de nouveaux produits** directement depuis l'interface
- **Sauvegarde automatique** dans la base de données
- **Tri** sur toutes les colonnes, **recherche** en temps réel
- Entièrement en **français**

---

## Démarrage avec Docker

1. Cloner ou télécharger ce dépôt
2. Lancer `docker compose up --build`
3. Ouvrir `http://localhost:3005`

La base SQLite est conservée dans le volume Docker `suivi_epi_data`. Au premier démarrage, `sample-products.json` est importé automatiquement si la base est vide.

Pour arrêter l'application :

```bash
docker compose down
```

Pour supprimer également les données persistées :

```bash
docker compose down -v
```

## Démarrage local sans Docker

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000`. Le fichier `index.html` reste également utilisable directement en mode local JSON, sans serveur.

---

## Compatibilité navigateurs et sauvegarde

| Mode | Sauvegarde |
|---|---|
| API/Docker (`http://localhost:3005`) | ✅ Sauvegarde dans SQLite |
| Fichier local (`index.html`) | ⬇️ Sauvegarde JSON via le navigateur |

La base de données doit être sauvegardée séparément du conteneur. Le volume Docker protège les données lors d'un redémarrage, mais ne remplace pas une sauvegarde.

---

## Format du fichier JSON

Le fichier JSON doit contenir un tableau d'objets. Exemple :

```json
[
  {
    "productName": "Grigri+",
    "manufacturer": "Petzl",
    "productType": "Assureur",
    "serialNumber": "SN-123456",
    "clubNumber": "C-042",
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
| `serialNumber` | `string` | — | Numéro de série du produit |
| `clubNumber` | `string` | — | Numéro attribué par le club |
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
├── app.js               # Frontend et appels API
├── server.js            # API Express et initialisation SQLite
├── package.json         # Dépendances backend
├── Dockerfile           # Image de production
├── docker-compose.yml   # Service et volume de données
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
