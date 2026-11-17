const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'vault.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance & foreign key support
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vault_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      category TEXT DEFAULT 'Personal',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'active',
      pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_vault_items_user_id ON vault_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_vault_items_user_cat ON vault_items(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_vault_items_user_status ON vault_items(user_id, status);
  `);

  // Seed default demo accounts if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    seedDemoData();
  }
}

function seedDemoData() {
  console.log('🌱 Seeding initial demo users and isolated datasets...');
  const salt = 10;
  const hashAlice = bcrypt.hashSync('Password123!', salt);
  const hashBob = bcrypt.hashSync('Password123!', salt);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO vault_items (user_id, title, content, category, priority, status, pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const alice = insertUser.run('Alice Walker', 'alice@example.com', hashAlice);
  const bob = insertUser.run('Bob Martinez', 'bob@example.com', hashBob);

  const aliceId = alice.lastInsertRowid;
  const bobId = bob.lastInsertRowid;

  // Alice's private data
  insertItem.run(
    aliceId,
    'Q4 Engineering Goals',
    '1. Migrate auth tokens to secure HTTP-only cookies\n2. Enforce strict database row-level scoping\n3. Zero trust policy on external API calls',
    'Work',
    'high',
    'active',
    1
  );
  insertItem.run(
    aliceId,
    'Apartment Lease Renewal Checklist',
    'Check with landlord before end of month regarding deposit return and parking permit.',
    'Personal',
    'medium',
    'active',
    0
  );
  insertItem.run(
    aliceId,
    'Stock Portfolio Strategy 2026',
    'Rebalance index funds to 70% total market, 20% international, 10% emergency treasury bonds.',
    'Finance',
    'low',
    'active',
    0
  );

  // Bob's private data (completely separate!)
  insertItem.run(
    bobId,
    'Client Pitch Deck Notes',
    'Review slide 14 on enterprise pricing tiers. Highlight SOC-2 compliance and dedicated clusters.',
    'Work',
    'high',
    'active',
    1
  );
  insertItem.run(
    bobId,
    'Marathon Training Schedule',
    'Week 4:\n- Tue: 8km tempo\n- Thu: 10km intervals\n- Sat: 21km long run',
    'Personal',
    'medium',
    'active',
    0
  );

  console.log('✅ Demo seeding complete: Alice (ID: 1) and Bob (ID: 2) initialized.');
}

module.exports = {
  db,
  initializeDatabase,
  seedDemoData
};
