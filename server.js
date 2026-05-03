const http = require("http");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const SQLITE_FILE = path.join(DATA_DIR, "expense-tracker.sqlite");
const LEGACY_JSON_FILE = path.join(DATA_DIR, "db.json");
const REQUESTED_BACKEND = String(process.env.DATA_BACKEND || "sqlite").toLowerCase();

let database;
let firestore;
let activeBackend = "sqlite";

const defaultDb = {
  settings: {
    currency: "INR",
    monthlyBudget: 3200,
    categoryBudgets: {
      Food: 720,
      Housing: 1350,
      Transport: 360,
      Utilities: 280,
      Health: 240,
      Shopping: 360,
      Entertainment: 260,
      Travel: 420,
      Other: 250
    }
  },
  transactions: [
    {
      id: "seed-1",
      type: "income",
      title: "Paycheck",
      category: "Salary",
      amount: 5400,
      date: "2026-05-01",
      account: "Checking",
      notes: "Monthly salary"
    },
    {
      id: "seed-2",
      type: "expense",
      title: "Rent",
      category: "Housing",
      amount: 1350,
      date: "2026-05-02",
      account: "Checking",
      notes: "Apartment rent"
    },
    {
      id: "seed-3",
      type: "expense",
      title: "Groceries",
      category: "Food",
      amount: 146.78,
      date: "2026-05-04",
      account: "Debit Card",
      notes: "Weekly shop"
    },
    {
      id: "seed-4",
      type: "expense",
      title: "Metro pass",
      category: "Transport",
      amount: 92,
      date: "2026-05-05",
      account: "Credit Card",
      notes: ""
    },
    {
      id: "seed-5",
      type: "expense",
      title: "Streaming bundle",
      category: "Entertainment",
      amount: 32.99,
      date: "2026-05-08",
      account: "Credit Card",
      notes: ""
    },
    {
      id: "seed-6",
      type: "expense",
      title: "Pharmacy",
      category: "Health",
      amount: 58.24,
      date: "2026-05-10",
      account: "Debit Card",
      notes: ""
    },
    {
      id: "seed-7",
      type: "income",
      title: "Freelance invoice",
      category: "Freelance",
      amount: 860,
      date: "2026-05-12",
      account: "Checking",
      notes: "Landing page work"
    },
    {
      id: "seed-8",
      type: "expense",
      title: "New desk lamp",
      category: "Shopping",
      amount: 84.5,
      date: "2026-05-13",
      account: "Credit Card",
      notes: ""
    },
    {
      id: "seed-9",
      type: "expense",
      title: "Electric bill",
      category: "Utilities",
      amount: 118.1,
      date: "2026-05-16",
      account: "Checking",
      notes: ""
    }
  ]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function loadEnvFile(filePath) {
  try {
    const raw = fsSync.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      const name = key.trim();
      if (!name || process.env[name] !== undefined) continue;
      process.env[name] = parseEnvValue(valueParts.join("="));
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  const isDoubleQuoted = trimmed.startsWith("\"") && trimmed.endsWith("\"");
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");
  if (isDoubleQuoted || isSingleQuoted) {
    return trimmed.slice(1, -1).replaceAll("\\n", "\n");
  }
  return trimmed;
}

async function ensureDb() {
  if (REQUESTED_BACKEND === "firebase" || REQUESTED_BACKEND === "firestore") {
    await ensureFirebaseDb();
    return;
  }

  await ensureSqliteDb();
}

async function ensureSqliteDb() {
  activeBackend = "sqlite";
  await fs.mkdir(DATA_DIR, { recursive: true });

  if (!database) {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require("node:sqlite"));
    } catch {
      throw new Error("SQLite fallback requires a Node.js runtime with node:sqlite support. Use DATA_BACKEND=firebase for deployment.");
    }

    database = new DatabaseSync(SQLITE_FILE);
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        currency TEXT NOT NULL,
        monthlyBudget REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS category_budgets (
        category TEXT PRIMARY KEY,
        amount REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        date TEXT NOT NULL,
        account TEXT NOT NULL DEFAULT 'Wallet',
        notes TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    `);
  }

  const settingsCount = database.prepare("SELECT COUNT(*) AS count FROM settings").get().count;
  if (settingsCount === 0) {
    writeSqliteDb(await loadInitialDb());
  }
}

async function readDb() {
  await ensureDb();
  if (activeBackend === "firebase") {
    return readFirebaseDb();
  }
  return readSqliteDb();
}

function readSqliteDb() {
  const settingsRow = database.prepare("SELECT currency, monthlyBudget FROM settings WHERE id = 1").get();
  const budgetRows = database.prepare("SELECT category, amount FROM category_budgets ORDER BY category ASC").all();
  const transactions = database.prepare(`
    SELECT id, type, title, category, amount, date, account, notes
    FROM transactions
    ORDER BY date DESC, createdAt DESC
  `).all();

  const categoryBudgets = Object.fromEntries(
    budgetRows.map((row) => [row.category, Number(row.amount)])
  );

  return {
    settings: {
      ...defaultDb.settings,
      ...(settingsRow || {}),
      categoryBudgets
    },
    transactions
  };
}

async function writeDb(db) {
  await ensureDb();
  if (activeBackend === "firebase") {
    await writeFirebaseDb(db);
    return;
  }
  writeSqliteDb(db);
}

async function loadInitialDb() {
  try {
    const raw = await fs.readFile(LEGACY_JSON_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      settings: { ...defaultDb.settings, ...(parsed.settings || {}) },
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : defaultDb.transactions
    };
  } catch {
    return defaultDb;
  }
}

function writeSqliteDb(db) {
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM transactions").run();
    database.prepare("DELETE FROM category_budgets").run();
    database.prepare("DELETE FROM settings").run();

    database.prepare(`
      INSERT INTO settings (id, currency, monthlyBudget)
      VALUES (1, ?, ?)
    `).run(db.settings.currency, Number(db.settings.monthlyBudget || 0));

    const insertBudget = database.prepare(`
      INSERT INTO category_budgets (category, amount)
      VALUES (?, ?)
    `);
    for (const [category, amount] of Object.entries(db.settings.categoryBudgets || {})) {
      insertBudget.run(category, Number(amount || 0));
    }

    const insertTransaction = database.prepare(`
      INSERT INTO transactions (id, type, title, category, amount, date, account, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of db.transactions || []) {
      insertTransaction.run(
        item.id,
        item.type,
        item.title,
        item.category,
        Number(item.amount),
        item.date,
        item.account || "Wallet",
        item.notes || "",
        new Date().toISOString()
      );
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function ensureFirebaseDb() {
  if (firestore) {
    activeBackend = "firebase";
    return;
  }

  let admin;
  try {
    admin = require("firebase-admin");
  } catch {
    throw new Error("Firebase backend requested, but firebase-admin is not installed. Run npm install first.");
  }

  const credential = getFirebaseCredential(admin);
  const appOptions = { credential };
  if (process.env.FIREBASE_PROJECT_ID) {
    appOptions.projectId = process.env.FIREBASE_PROJECT_ID;
  }

  if (!admin.apps.length) {
    admin.initializeApp(appOptions);
  }

  firestore = admin.firestore();
  activeBackend = "firebase";

  const settingsDoc = await firestore.collection("settings").doc("app").get();
  if (!settingsDoc.exists) {
    await writeFirebaseDb(await loadInitialDb());
  }
}

function getFirebaseCredential(admin) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.isAbsolute(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      : path.join(ROOT, process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const serviceAccount = JSON.parse(fsSync.readFileSync(serviceAccountPath, "utf8"));
    return admin.credential.cert(serviceAccount);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replaceAll("\\n", "\n")
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.applicationDefault();
  }

  throw new Error(
    "Firebase backend requested, but credentials are missing. Configure FIREBASE_SERVICE_ACCOUNT_PATH or Firebase service account environment variables."
  );
}

async function readFirebaseDb() {
  const [settingsDoc, budgetSnapshot, transactionSnapshot] = await Promise.all([
    firestore.collection("settings").doc("app").get(),
    firestore.collection("categoryBudgets").get(),
    firestore.collection("transactions").orderBy("date", "desc").get()
  ]);

  const settingsData = settingsDoc.exists ? settingsDoc.data() : {};
  const categoryBudgets = {};
  for (const doc of budgetSnapshot.docs) {
    const data = doc.data();
    if (data.category) {
      categoryBudgets[data.category] = Number(data.amount || 0);
    }
  }

  const transactions = transactionSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      type: data.type,
      title: data.title,
      category: data.category,
      amount: Number(data.amount || 0),
      date: data.date,
      account: data.account || "Wallet",
      notes: data.notes || ""
    };
  });

  return {
    settings: {
      ...defaultDb.settings,
      ...settingsData,
      categoryBudgets
    },
    transactions
  };
}

async function writeFirebaseDb(db) {
  await firestore.collection("settings").doc("app").set({
    currency: db.settings.currency,
    monthlyBudget: Number(db.settings.monthlyBudget || 0)
  });

  await rewriteFirebaseCollection(
    "categoryBudgets",
    Object.entries(db.settings.categoryBudgets || {}).map(([category, amount]) => ({
      category,
      amount: Number(amount || 0)
    })),
    (item) => docIdFromCategory(item.category)
  );

  await rewriteFirebaseCollection(
    "transactions",
    (db.transactions || []).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      category: item.category,
      amount: Number(item.amount),
      date: item.date,
      account: item.account || "Wallet",
      notes: item.notes || ""
    })),
    (item) => item.id
  );
}

async function rewriteFirebaseCollection(collectionName, records, getId) {
  const collection = firestore.collection(collectionName);
  const existing = await collection.get();
  const operations = [
    ...existing.docs.map((doc) => (batch) => batch.delete(doc.ref)),
    ...records.map((record) => (batch) => {
      const { id, ...data } = record;
      batch.set(collection.doc(getId(record)), data);
    })
  ];

  await commitFirestoreOperations(operations);
}

async function commitFirestoreOperations(operations) {
  for (let index = 0; index < operations.length; index += 450) {
    const batch = firestore.batch();
    for (const operation of operations.slice(index, index + 450)) {
      operation(batch);
    }
    await batch.commit();
  }
}

function docIdFromCategory(category) {
  return encodeURIComponent(category).replaceAll(".", "%2E");
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method not allowed" });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeTransaction(input, existing = {}) {
  const title = String(input.title ?? existing.title ?? "").trim();
  const type = String(input.type ?? existing.type ?? "expense").trim().toLowerCase();
  const category = String(input.category ?? existing.category ?? "").trim();
  const amount = Number(input.amount ?? existing.amount);
  const date = String(input.date ?? existing.date ?? "").trim();
  const account = String(input.account ?? existing.account ?? "Wallet").trim() || "Wallet";
  const notes = String(input.notes ?? existing.notes ?? "").trim();

  const errors = [];
  if (!title) errors.push("Title is required");
  if (!["income", "expense"].includes(type)) errors.push("Type must be income or expense");
  if (!category) errors.push("Category is required");
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Amount must be greater than zero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) {
    errors.push("Date must use YYYY-MM-DD");
  }

  if (errors.length) {
    return { errors };
  }

  return {
    transaction: {
      id: existing.id || crypto.randomUUID(),
      type,
      title,
      category,
      amount: Math.round(amount * 100) / 100,
      date,
      account,
      notes
    }
  };
}

function normalizeSettings(input, existing) {
  const currency = String(input.currency ?? existing.currency ?? "INR").trim().toUpperCase();
  const monthlyBudget = Number(input.monthlyBudget ?? existing.monthlyBudget ?? 0);
  const categoryBudgets = input.categoryBudgets && typeof input.categoryBudgets === "object"
    ? input.categoryBudgets
    : existing.categoryBudgets || {};

  const cleanedBudgets = {};
  for (const [category, value] of Object.entries(categoryBudgets)) {
    const key = String(category).trim();
    const amount = Number(value);
    if (key && Number.isFinite(amount) && amount >= 0) {
      cleanedBudgets[key] = Math.round(amount * 100) / 100;
    }
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    return { errors: ["Currency must be a 3-letter ISO code"] };
  }
  if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
    return { errors: ["Monthly budget must be zero or greater"] };
  }

  return {
    settings: {
      currency,
      monthlyBudget: Math.round(monthlyBudget * 100) / 100,
      categoryBudgets: cleanedBudgets
    }
  };
}

function monthKey(dateString) {
  return dateString.slice(0, 7);
}

function summarize(db, month) {
  const transactions = db.transactions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const currentMonth = month || new Date().toISOString().slice(0, 7);
  const monthTransactions = transactions.filter((item) => monthKey(item.date) === currentMonth);
  const income = sum(monthTransactions.filter((item) => item.type === "income"));
  const expenses = sum(monthTransactions.filter((item) => item.type === "expense"));
  const categoryTotals = {};
  const dailyTotals = {};

  for (const item of monthTransactions) {
    if (item.type !== "expense") continue;
    categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.amount;
    dailyTotals[item.date] = (dailyTotals[item.date] || 0) + item.amount;
  }

  return {
    month: currentMonth,
    income,
    expenses,
    balance: Math.round((income - expenses) * 100) / 100,
    budget: db.settings.monthlyBudget,
    budgetRemaining: Math.round((db.settings.monthlyBudget - expenses) * 100) / 100,
    categoryTotals: roundObject(categoryTotals),
    dailyTotals: roundObject(dailyTotals),
    transactionCount: monthTransactions.length,
    recent: transactions.slice(0, 6)
  };
}

function sum(items) {
  return Math.round(items.reduce((total, item) => total + Number(item.amount || 0), 0) * 100) / 100;
}

function roundObject(input) {
  return Object.fromEntries(
    Object.entries(input)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => [key, Math.round(value * 100) / 100])
  );
}

async function handleApi(req, res, url) {
  try {
    const db = await readDb();

    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/transactions") {
      if (req.method === "GET") {
        sendJson(res, 200, { transactions: db.transactions });
        return;
      }

      if (req.method === "POST") {
        const body = await parseJsonBody(req);
        const result = normalizeTransaction(body);
        if (result.errors) {
          sendJson(res, 400, { errors: result.errors });
          return;
        }
        db.transactions.unshift(result.transaction);
        await writeDb(db);
        sendJson(res, 201, { transaction: result.transaction });
        return;
      }

      methodNotAllowed(res);
      return;
    }

    const transactionMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
    if (transactionMatch) {
      const id = decodeURIComponent(transactionMatch[1]);
      const index = db.transactions.findIndex((item) => item.id === id);
      if (index === -1) {
        notFound(res);
        return;
      }

      if (req.method === "PUT") {
        const body = await parseJsonBody(req);
        const result = normalizeTransaction(body, db.transactions[index]);
        if (result.errors) {
          sendJson(res, 400, { errors: result.errors });
          return;
        }
        db.transactions[index] = result.transaction;
        await writeDb(db);
        sendJson(res, 200, { transaction: result.transaction });
        return;
      }

      if (req.method === "DELETE") {
        const [deleted] = db.transactions.splice(index, 1);
        await writeDb(db);
        sendJson(res, 200, { transaction: deleted });
        return;
      }

      methodNotAllowed(res);
      return;
    }

    if (url.pathname === "/api/settings") {
      if (req.method === "GET") {
        sendJson(res, 200, { settings: db.settings });
        return;
      }

      if (req.method === "PUT") {
        const body = await parseJsonBody(req);
        const result = normalizeSettings(body, db.settings);
        if (result.errors) {
          sendJson(res, 400, { errors: result.errors });
          return;
        }
        db.settings = result.settings;
        await writeDb(db);
        sendJson(res, 200, { settings: db.settings });
        return;
      }

      methodNotAllowed(res);
      return;
    }

    if (url.pathname === "/api/summary") {
      if (req.method !== "GET") {
        methodNotAllowed(res);
        return;
      }
      sendJson(res, 200, { summary: summarize(db, url.searchParams.get("month")) });
      return;
    }

    notFound(res);
  } catch (error) {
    const message = error.message || "Server error";
    const status = ["Invalid JSON", "Body is too large"].includes(message) ? 400 : 500;
    sendJson(res, status, { error: message });
  }
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    notFound(res);
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Content-Length": content.length
    });
    res.end(content);
  } catch {
    if (path.extname(filePath)) {
      notFound(res);
      return;
    }
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": fallback.length
    });
    res.end(fallback);
  }
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
}

const server = http.createServer(requestHandler);

if (require.main === module) {
  ensureDb()
    .then(() => {
      server.listen(PORT, () => {
        console.log(`Expense tracker running at http://localhost:${PORT} using ${activeBackend === "firebase" ? "Firebase Firestore" : "SQLite"}`);
      });
    })
    .catch((error) => {
      console.error("Failed to start server", error);
      process.exit(1);
    });
}

module.exports = requestHandler;
