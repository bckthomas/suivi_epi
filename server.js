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
    description TEXT NOT NULL DEFAULT '',
    buying_date TEXT NOT NULL,
    lifetime INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS epi_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    inspector TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('pass', 'fail')),
    notes TEXT NOT NULL DEFAULT ''
  );
`);

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

function readProducts() {
  const products = db.prepare(`
    SELECT id, product_name AS productName, manufacturer, product_type AS productType,
           serial_number AS serialNumber, club_number AS clubNumber, description,
           buying_date AS buyingDate, lifetime
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
        (product_name, manufacturer, product_type, serial_number, club_number, description, buying_date, lifetime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCheck = db.prepare(`
      INSERT INTO epi_checks (product_id, date, inspector, result, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    products.forEach(function (product) {
      const result = insertProduct.run(
        product.productName || '', product.manufacturer || '', product.productType || '',
        product.serialNumber || '', product.clubNumber || '', product.description || '',
        product.buyingDate || '', Number.isInteger(product.lifetime) ? product.lifetime : 0
      );
      (Array.isArray(product.epiChecks) ? product.epiChecks : []).forEach(function (check) {
        insertCheck.run(result.lastInsertRowid, check.date || '', check.inspector || '', check.result === 'fail' ? 'fail' : 'pass', check.notes || '');
      });
    });
  });
  replaceProducts(req.body);
  res.json(readProducts());
});

app.get('/api/health', function (req, res) {
  res.json({ status: 'ok' });
});

app.use(express.static(__dirname));

importSampleDataIfEmpty();
app.listen(port, '0.0.0.0', function () {
  console.log('Suivi EPI disponible sur http://localhost:' + port);
});