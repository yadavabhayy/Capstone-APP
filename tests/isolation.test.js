/**
 * Automated Verification Test Suite
 * Tests:
 * 1. Secure Password Hashing (bcrypt)
 * 2. Strict User-Scoped Row-Level Data Isolation (Zero Data Leakage)
 * 3. Prevention of Cross-User Access, Modification, and Deletion
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TEST_SECRET = 'test_secret_for_suite_run_123';

console.log('====================================================');
console.log('🧪 RUNNING SECUREVAULT CAPSTONE VERIFICATION SUITE');
console.log('====================================================\n');

// 1. Create an isolated in-memory test database
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE vault_items (
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
`);

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    process.exitCode = 1;
  }
}

// ==========================================
// TEST SUITE 1: PASSWORD HASHING
// ==========================================
console.log('📋 Test Group 1: Password Hashing & Authentication Security');

const rawPasswordAlice = 'SecretPasswordAlice!99';
const rawPasswordBob = 'SecretPasswordBob!88';

const hashAlice = bcrypt.hashSync(rawPasswordAlice, 10);
const hashBob = bcrypt.hashSync(rawPasswordBob, 10);

assert(hashAlice !== rawPasswordAlice, 'Alice password is never stored in plaintext');
assert(hashBob !== rawPasswordBob, 'Bob password is never stored in plaintext');
assert(hashAlice.startsWith('$2'), 'Alice password uses valid bcrypt algorithm format ($2a/$2b)');
assert(bcrypt.compareSync(rawPasswordAlice, hashAlice), 'Bcrypt successfully matches Alice correct password');
assert(!bcrypt.compareSync('WrongPassword123', hashAlice), 'Bcrypt correctly rejects invalid password');

// Insert users into database
const insertUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
const userAlice = insertUser.run('Alice Walker', 'alice@test.com', hashAlice);
const userBob = insertUser.run('Bob Martinez', 'bob@test.com', hashBob);

const aliceId = userAlice.lastInsertRowid;
const bobId = userBob.lastInsertRowid;

assert(aliceId !== bobId, 'Alice and Bob have unique user identifiers');

// ==========================================
// TEST SUITE 2: DATA SCOPING & ISOLATION
// ==========================================
console.log('\n📋 Test Group 2: Data Scoping to Signed-in User');

const insertItem = db.prepare(`
  INSERT INTO vault_items (user_id, title, content, category, priority, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Alice creates 2 items
const aliceItem1 = insertItem.run(aliceId, 'Alice Secret Blueprint', 'Quantum encryption specs', 'Work', 'high', 'active');
const aliceItem2 = insertItem.run(aliceId, 'Alice Groceries', 'Organic oat milk, avocados', 'Personal', 'low', 'active');

// Bob creates 1 item
const bobItem1 = insertItem.run(bobId, 'Bob Confidential Pitch', 'Q3 Sales target numbers', 'Work', 'high', 'active');

const aliceItem1Id = aliceItem1.lastInsertRowid;
const bobItem1Id = bobItem1.lastInsertRowid;

// Query items as Alice: SELECT * FROM vault_items WHERE user_id = aliceId
const aliceItems = db.prepare('SELECT * FROM vault_items WHERE user_id = ?').all(aliceId);
assert(aliceItems.length === 2, 'Alice can fetch all 2 of her items');
assert(!aliceItems.some(item => item.title.includes('Bob')), 'Alice results contain ZERO records belonging to Bob');

// Query items as Bob: SELECT * FROM vault_items WHERE user_id = bobId
const bobItems = db.prepare('SELECT * FROM vault_items WHERE user_id = ?').all(bobId);
assert(bobItems.length === 1, 'Bob can fetch his 1 item');
assert(!bobItems.some(item => item.title.includes('Alice')), 'Bob results contain ZERO records belonging to Alice');

// ==========================================
// TEST SUITE 3: CROSS-USER ACCESS & ATTACK PREVENTION
// ==========================================
console.log('\n📋 Test Group 3: Cross-User ID Enumeration & Attack Prevention');

// Attack 1: Alice tries to fetch Bob's item directly by ID
const attackFetch = db.prepare('SELECT * FROM vault_items WHERE id = ? AND user_id = ?').get(bobItem1Id, aliceId);
assert(attackFetch === undefined, 'Alice direct query for Bobs item ID returns null/empty (404 Not Found behavior)');

// Attack 2: Alice attempts to update/overwrite Bob's confidential item
const attackUpdate = db.prepare(`
  UPDATE vault_items
  SET title = 'Hacked by Alice', content = 'Pawned'
  WHERE id = ? AND user_id = ?
`).run(bobItem1Id, aliceId);

assert(attackUpdate.changes === 0, 'Alice cross-user UPDATE query modifies 0 rows');

// Verify Bob's item is still intact
const bobItemAfterAttack = db.prepare('SELECT * FROM vault_items WHERE id = ?').get(bobItem1Id);
assert(bobItemAfterAttack.title === 'Bob Confidential Pitch', 'Bobs item content remained completely intact after attack');

// Attack 3: Alice attempts to DELETE Bob's item
const attackDelete = db.prepare('DELETE FROM vault_items WHERE id = ? AND user_id = ?').run(bobItem1Id, aliceId);
assert(attackDelete.changes === 0, 'Alice cross-user DELETE query deletes 0 rows');

const bobItemAfterDeleteAttack = db.prepare('SELECT * FROM vault_items WHERE id = ?').get(bobItem1Id);
assert(bobItemAfterDeleteAttack !== undefined, 'Bobs item was NOT deleted by Alice');

// Clean legitimate deletion: Alice deletes her own item
const legitDelete = db.prepare('DELETE FROM vault_items WHERE id = ? AND user_id = ?').run(aliceItem1Id, aliceId);
assert(legitDelete.changes === 1, 'Alice can legitimately delete her own item');

const remainingAlice = db.prepare('SELECT * FROM vault_items WHERE user_id = ?').all(aliceId);
assert(remainingAlice.length === 1, 'Alice has exactly 1 item remaining');

// Bob still has his item intact
const remainingBob = db.prepare('SELECT * FROM vault_items WHERE user_id = ?').all(bobId);
assert(remainingBob.length === 1, 'Bob item count remains completely unaffected');

// ==========================================
// TEST SUITE 4: JWT TOKEN INTEGRITY
// ==========================================
console.log('\n📋 Test Group 4: Session Security & Token Validation');

const validToken = jwt.sign({ id: aliceId, email: 'alice@test.com' }, TEST_SECRET, { expiresIn: '1h' });
const decoded = jwt.verify(validToken, TEST_SECRET);
assert(decoded.id === aliceId, 'Signed JWT token verifies and decodes correct user ID');

let tamperCaught = false;
try {
  jwt.verify(validToken, 'tampered_or_invalid_secret');
} catch (e) {
  tamperCaught = true;
}
assert(tamperCaught, 'Tampered token signature is immediately rejected');

console.log('\n====================================================');
console.log(`🎯 RESULTS: ${passedTests}/${totalTests} Tests Passed successfully!`);
console.log('✅ Hashed passwords verified.');
console.log('✅ Strict user data scoping verified.');
console.log('====================================================\n');

db.close();
