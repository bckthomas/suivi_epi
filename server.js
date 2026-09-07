const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const databasePath = path.join(dataDir, 'suivi-epi.db');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    product_type TEXT NOT NULL,
    serial_number TEXT NOT NULL DEFAULT '',
    club_number TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    lost INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    buying_date TEXT NOT NULL,
    lifetime INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS epi_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    inspector TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'lost')),
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS product_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS manufacturers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare('PRAGMA table_info(' + table + ')').all();
  if (!columns.some(function (item) { return item.name === column; })) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
  }
}

ensureColumn('products', 'color', "TEXT NOT NULL DEFAULT ''");
ensureColumn('products', 'lost', 'INTEGER NOT NULL DEFAULT 0');

const checksSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'epi_checks'").get();
if (checksSchema && !checksSchema.sql.includes("'lost'")) {
  db.transaction(function () {
    db.exec('ALTER TABLE epi_checks RENAME TO epi_checks_legacy');
    db.exec(`
      CREATE TABLE epi_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        inspector TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'lost')),
        notes TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO epi_checks (id, product_id, date, inspector, result, notes)
      SELECT id, product_id, date, inspector, result, notes FROM epi_checks_legacy;
      DROP TABLE epi_checks_legacy;
    `);
  })();
}

function importSampleDataIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  const samplePath = path.join(__dirname, 'sample-products.json');
  if (count !== 0 || !fs.existsSync(samplePath)) return;

  const products = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const insertProduct = db.prepare(`
    INSERT INTO products
      (product_name, manufacturer, product_type, serial_number, club_number, description, buying_date, lifetime)
    VALUES (@productName, @manufacturer, @productType, @serialNumber, @clubNumber, @description, @buyingDate, @lifetime)
  `);
  const insertCheck = db.prepare(`
    INSERT INTO epi_checks (product_id, date, inspector, result, notes)
    VALUES (@productId, @date, @inspector, @result, @notes)
  `);

  const importProducts = db.transaction(function (items) {
    items.forEach(function (product) {
      const result = insertProduct.run({
        productName: product.productName || '',
        manufacturer: product.manufacturer || '',
        productType: product.productType || '',
        serialNumber: product.serialNumber || '',
        clubNumber: product.clubNumber || '',
        description: product.description || '',
        buyingDate: product.buyingDate || '',
        lifetime: Number.isInteger(product.lifetime) ? product.lifetime : 0,
      });
      (Array.isArray(product.epiChecks) ? product.epiChecks : []).forEach(function (check) {
        insertCheck.run({
          productId: result.lastInsertRowid,
          date: check.date || '',
          inspector: check.inspector || '',
          result: check.result === 'fail' ? 'fail' : 'pass',
          notes: check.notes || '',
        });
      });
    });
  });

  importProducts(products);
}

// Reference lists (product types, manufacturers, colors) share the same shape:
// a lookup table of unique names, seeded from existing product values, renamed
// or deleted with the same rules (rename cascades, delete can replace usages).
const referenceLists = [
  { table: 'product_types', column: 'product_type', route: 'product-types', label: 'type de produit' },
  { table: 'manufacturers', column: 'manufacturer', route: 'manufacturers', label: 'fabricant' },
  { table: 'colors', column: 'color', route: 'colors', label: 'couleur' },
];

function seedReferenceListIfEmpty(cfg) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM ' + cfg.table).get().count;
  if (count !== 0) return;
  const distinct = db.prepare('SELECT DISTINCT ' + cfg.column + " AS name FROM products WHERE " + cfg.column + " != ''").all();
  const insert = db.prepare('INSERT OR IGNORE INTO ' + cfg.table + ' (name) VALUES (?)');
  db.transaction(function () {
    distinct.forEach(function (row) { insert.run(row.name); });
  })();
}

function readReferenceList(cfg) {
  return db.prepare(`
    SELECT t.id, t.name, COUNT(p.id) AS count
    FROM ${cfg.table} t
    LEFT JOIN products p ON p.${cfg.column} = t.name
    GROUP BY t.id, t.name
    ORDER BY t.name COLLATE NOCASE
  `).all();
}

function registerReferenceListRoutes(cfg) {
  app.get('/api/' + cfg.route, function (req, res) {
    res.json(readReferenceList(cfg));
  });

  app.post('/api/' + cfg.route, function (req, res) {
    const name = String(req.body && req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Le nom du ' + cfg.label + ' est obligatoire.' });
    try {
      db.prepare('INSERT INTO ' + cfg.table + ' (name) VALUES (?)').run(name);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ce ' + cfg.label + ' existe déjà.' });
      throw err;
    }
    res.status(201).json(readReferenceList(cfg));
  });

  app.put('/api/' + cfg.route + '/:id', function (req, res) {
    const id = Number(req.params.id);
    const name = String(req.body && req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Le nom du ' + cfg.label + ' est obligatoire.' });
    const existing = db.prepare('SELECT * FROM ' + cfg.table + ' WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: cfg.label.charAt(0).toUpperCase() + cfg.label.slice(1) + ' introuvable.' });
    const rename = db.transaction(function () {
      db.prepare('UPDATE ' + cfg.table + ' SET name = ? WHERE id = ?').run(name, id);
      db.prepare('UPDATE products SET ' + cfg.column + ' = ? WHERE ' + cfg.column + ' = ?').run(name, existing.name);
    });
    try {
      rename();
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ce ' + cfg.label + ' existe déjà.' });
      throw err;
    }
    res.json(readReferenceList(cfg));
  });

  app.delete('/api/' + cfg.route + '/:id', function (req, res) {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM ' + cfg.table + ' WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: cfg.label.charAt(0).toUpperCase() + cfg.label.slice(1) + ' introuvable.' });
    const inUse = db.prepare('SELECT COUNT(*) AS count FROM products WHERE ' + cfg.column + ' = ?').get(existing.name).count;
    const hasReplacement = Object.prototype.hasOwnProperty.call(req.body || {}, 'replacementId');
    const replacementId = hasReplacement && req.body.replacementId !== null ? Number(req.body.replacementId) : null;
    let replacement = null;

    if (inUse > 0 && !hasReplacement) {
      return res.status(400).json({ error: 'Un remplacement est obligatoire pour ce ' + cfg.label + '.' });
    }
    if (hasReplacement && replacementId !== null) {
      replacement = db.prepare('SELECT * FROM ' + cfg.table + ' WHERE id = ?').get(replacementId);
      if (!replacement || replacement.id === existing.id) {
        return res.status(400).json({ error: 'Le remplacement choisi est invalide.' });
      }
    }
    if (inUse > 0 && !replacement && cfg.route !== 'colors') {
      return res.status(400).json({ error: 'Un remplacement est obligatoire pour ce ' + cfg.label + '.' });
    }

    const replaceAndDelete = db.transaction(function () {
      if (inUse > 0) {
        db.prepare('UPDATE products SET ' + cfg.column + ' = ? WHERE ' + cfg.column + ' = ?')
          .run(replacement ? replacement.name : '', existing.name);
      }
      db.prepare('DELETE FROM ' + cfg.table + ' WHERE id = ?').run(id);
    });
    replaceAndDelete();
    res.json(readReferenceList(cfg));
  });
}

function readProducts() {
  const products = db.prepare(`
    SELECT id, product_name AS productName, manufacturer, product_type AS productType,
           serial_number AS serialNumber, club_number AS clubNumber,
           color, lost, description, buying_date AS buyingDate, lifetime
    FROM products ORDER BY id
  `).all();
  const checks = db.prepare(`
    SELECT id, product_id AS productId, date, inspector, result, notes
    FROM epi_checks ORDER BY date DESC, id DESC
  `).all();
  const checksByProduct = new Map();
  checks.forEach(function (check) {
    if (!checksByProduct.has(check.productId)) checksByProduct.set(check.productId, []);
    checksByProduct.get(check.productId).push({
      id: check.id,
      date: check.date,
      inspector: check.inspector,
      result: check.result,
      notes: check.notes,
    });
  });
  return products.map(function (product) {
    return { ...product, epiChecks: checksByProduct.get(product.id) || [] };
  });
}

app.use(express.json({ limit: '1mb' }));

app.get('/api/products', function (req, res) {
  res.json(readProducts());
});

app.put('/api/products', function (req, res) {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Le corps doit être un tableau.' });
  const replaceProducts = db.transaction(function (products) {
    db.prepare('DELETE FROM epi_checks').run();
    db.prepare('DELETE FROM products').run();
    const insertProduct = db.prepare(`
      INSERT INTO products
        (product_name, manufacturer, product_type, serial_number, club_number, color, lost, description, buying_date, lifetime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCheck = db.prepare(`
      INSERT INTO epi_checks (product_id, date, inspector, result, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    products.forEach(function (product) {
      const result = insertProduct.run(
        product.productName || '', product.manufacturer || '', product.productType || '',
        product.serialNumber || '', product.clubNumber || '', product.color || '', product.lost ? 1 : 0,
        product.description || '', product.buyingDate || '', Number.isInteger(product.lifetime) ? product.lifetime : 0
      );
      (Array.isArray(product.epiChecks) ? product.epiChecks : []).forEach(function (check) {
        insertCheck.run(result.lastInsertRowid, check.date || '', check.inspector || '', check.result === 'fail' ? 'fail' : check.result === 'lost' ? 'lost' : 'pass', check.notes || '');
      });
    });
  });
  replaceProducts(req.body);
  res.json(readProducts());
});

app.get('/api/health', function (req, res) {
  res.json({ status: 'ok' });
});

referenceLists.forEach(registerReferenceListRoutes);

app.use(express.static(__dirname));

importSampleDataIfEmpty();
referenceLists.forEach(seedReferenceListIfEmpty);
app.listen(port, '0.0.0.0', function () {
  console.log('Suivi EPI disponible sur http://localhost:' + port);
});