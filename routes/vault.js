const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all vault routes
router.use(requireAuth);

/**
 * GET /api/vault
 * Retrieve all items belonging EXCLUSIVELY to the authenticated user
 */
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { search, category, status, priority, sort } = req.query;

    let query = 'SELECT * FROM vault_items WHERE user_id = ?';
    const params = [userId];

    // Optional category filter
    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }

    // Optional status filter
    if (status && status !== 'All') {
      query += ' AND status = ?';
      params.push(status);
    }

    // Optional priority filter
    if (priority && priority !== 'All') {
      query += ' AND priority = ?';
      params.push(priority);
    }

    // Optional keyword search (searches title & content)
    if (search && search.trim()) {
      query += ' AND (title LIKE ? OR content LIKE ?)';
      const wildcard = `%${search.trim()}%`;
      params.push(wildcard, wildcard);
    }

    // Sorting
    switch (sort) {
      case 'oldest':
        query += ' ORDER BY pinned DESC, created_at ASC';
        break;
      case 'title':
        query += ' ORDER BY pinned DESC, title ASC';
        break;
      case 'priority':
        query += ` ORDER BY pinned DESC,
          CASE priority
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END ASC, created_at DESC`;
        break;
      case 'newest':
      default:
        query += ' ORDER BY pinned DESC, created_at DESC';
        break;
    }

    const items = db.prepare(query).all(...params);

    return res.json({
      success: true,
      scopedUserId: userId,
      count: items.length,
      data: items
    });
  } catch (err) {
    console.error('Error fetching vault items:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve vault items.'
    });
  }
});

/**
 * GET /api/vault/stats
 * Get summary KPI metrics strictly for the authenticated user
 */
router.get('/stats', (req, res) => {
  try {
    const userId = req.user.id;

    const total = db.prepare('SELECT COUNT(*) as count FROM vault_items WHERE user_id = ?').get(userId).count;
    const active = db.prepare('SELECT COUNT(*) as count FROM vault_items WHERE user_id = ? AND status = ?').get(userId, 'active').count;
    const completed = db.prepare('SELECT COUNT(*) as count FROM vault_items WHERE user_id = ? AND status = ?').get(userId, 'completed').count;
    const highPriority = db.prepare('SELECT COUNT(*) as count FROM vault_items WHERE user_id = ? AND priority = ?').get(userId, 'high').count;

    const categories = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM vault_items
      WHERE user_id = ?
      GROUP BY category
      ORDER BY count DESC
    `).all(userId);

    return res.json({
      success: true,
      stats: {
        total,
        active,
        completed,
        highPriority,
        categories
      }
    });
  } catch (err) {
    console.error('Error fetching vault stats:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve stats.'
    });
  }
});

/**
 * GET /api/vault/:id
 * Retrieve a single item by ID, enforcing user ownership
 */
router.get('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
      return res.status(400).json({ success: false, error: 'Invalid item ID.' });
    }

    const item = db.prepare('SELECT * FROM vault_items WHERE id = ? AND user_id = ?').get(itemId, userId);

    if (!item) {
      // Returns 404 to avoid leaking whether the item ID exists under another user
      return res.status(404).json({
        success: false,
        error: 'Item not found or unauthorized.'
      });
    }

    return res.json({
      success: true,
      data: item
    });
  } catch (err) {
    console.error('Error fetching vault item:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve item.'
    });
  }
});

/**
 * POST /api/vault
 * Create a new item scoped to the authenticated user
 */
router.post('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, category, priority, status, pinned } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Title is required.'
      });
    }

    const cleanTitle = title.trim();
    const cleanContent = content ? String(content).trim() : '';
    const cleanCategory = category ? String(category).trim() : 'Personal';
    const cleanPriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
    const cleanStatus = ['active', 'completed', 'archived'].includes(status) ? status : 'active';
    const cleanPinned = pinned ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO vault_items (user_id, title, content, category, priority, status, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      userId,
      cleanTitle,
      cleanContent,
      cleanCategory,
      cleanPriority,
      cleanStatus,
      cleanPinned
    );

    const created = db.prepare('SELECT * FROM vault_items WHERE id = ?').get(info.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Item saved securely to your personal vault.',
      data: created
    });
  } catch (err) {
    console.error('Error creating vault item:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to save item.'
    });
  }
});

/**
 * PUT /api/vault/:id
 * Update an existing item, strictly verifying user ownership
 */
router.put('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
      return res.status(400).json({ success: false, error: 'Invalid item ID.' });
    }

    // Check ownership
    const existing = db.prepare('SELECT * FROM vault_items WHERE id = ? AND user_id = ?').get(itemId, userId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Item not found or unauthorized.'
      });
    }

    const { title, content, category, priority, status, pinned } = req.body;

    const newTitle = title !== undefined ? String(title).trim() : existing.title;
    if (!newTitle) {
      return res.status(400).json({ success: false, error: 'Title cannot be empty.' });
    }

    const newContent = content !== undefined ? String(content).trim() : existing.content;
    const newCategory = category !== undefined ? String(category).trim() : existing.category;
    const newPriority = priority !== undefined && ['low', 'medium', 'high'].includes(priority) ? priority : existing.priority;
    const newStatus = status !== undefined && ['active', 'completed', 'archived'].includes(status) ? status : existing.status;
    const newPinned = pinned !== undefined ? (pinned ? 1 : 0) : existing.pinned;

    db.prepare(`
      UPDATE vault_items
      SET title = ?,
          content = ?,
          category = ?,
          priority = ?,
          status = ?,
          pinned = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(newTitle, newContent, newCategory, newPriority, newStatus, newPinned, itemId, userId);

    const updated = db.prepare('SELECT * FROM vault_items WHERE id = ? AND user_id = ?').get(itemId, userId);

    return res.json({
      success: true,
      message: 'Item updated successfully.',
      data: updated
    });
  } catch (err) {
    console.error('Error updating vault item:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update item.'
    });
  }
});

/**
 * DELETE /api/vault/:id
 * Delete an item strictly verifying user ownership
 */
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
      return res.status(400).json({ success: false, error: 'Invalid item ID.' });
    }

    const result = db.prepare('DELETE FROM vault_items WHERE id = ? AND user_id = ?').run(itemId, userId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found or unauthorized.'
      });
    }

    return res.json({
      success: true,
      message: 'Item removed from your personal vault.'
    });
  } catch (err) {
    console.error('Error deleting vault item:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete item.'
    });
  }
});

module.exports = router;
