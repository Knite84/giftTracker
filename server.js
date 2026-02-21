const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}
const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Create tables
    db.run(`CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      order_index INTEGER
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER,
      description TEXT NOT NULL,
      link TEXT,
      purchased INTEGER DEFAULT 0,
      order_index INTEGER,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )`);
    
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');
  }
});

// --- API ROUTES ---

// Helper function to handle database queries as promises
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// PEOPLE API
app.get('/api/people', async (req, res) => {
  try {
    const people = await getQuery('SELECT * FROM people ORDER BY order_index ASC, id ASC');
    res.json(people);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/people', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Check for duplicate (case insensitive)
    const existing = await getQuery('SELECT * FROM people WHERE LOWER(name) = LOWER(?)', [name]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'A person with this name already exists' });
    }

    // Get max order_index
    const maxOrder = await getQuery('SELECT MAX(order_index) as max_index FROM people');
    const newOrder = (maxOrder[0].max_index || 0) + 1;

    const result = await runQuery('INSERT INTO people (name, order_index) VALUES (?, ?)', [name, newOrder]);
    res.status(201).json({ id: result.lastID, name: name, order_index: newOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/people/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const { id } = req.params;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Check for duplicate (case insensitive, exclude self)
    const existing = await getQuery('SELECT * FROM people WHERE LOWER(name) = LOWER(?) AND id != ?', [name, id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'A person with this name already exists' });
    }

    await runQuery('UPDATE people SET name = ? WHERE id = ?', [name, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/people/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runQuery('DELETE FROM people WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/people/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body; // Array of IDs in the new order
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // Reorder using a transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare('UPDATE people SET order_index = ? WHERE id = ?');
      orderedIds.forEach((id, index) => {
        stmt.run(index, id);
      });
      stmt.finalize();
      db.run('COMMIT');
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GIFTS API
app.get('/api/gifts/:personId', async (req, res) => {
  try {
    const { personId } = req.params;
    const gifts = await getQuery('SELECT * FROM gifts WHERE person_id = ? ORDER BY order_index ASC, id ASC', [personId]);
    
    // Ensure purchased is boolean for frontend
    const formattedGifts = gifts.map(g => ({
      ...g,
      purchased: g.purchased === 1
    }));
    
    res.json(formattedGifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gifts', async (req, res) => {
  try {
    const { personId, description, link, purchased } = req.body;
    
    if (!personId || !description || description.trim() === '') {
      return res.status(400).json({ error: 'Person ID and Description are required' });
    }
    
    const isPurchased = purchased ? 1 : 0;

    // Get max order_index for this person's gifts
    const maxOrder = await getQuery('SELECT MAX(order_index) as max_index FROM gifts WHERE person_id = ?', [personId]);
    const newOrder = (maxOrder[0].max_index || 0) + 1;

    const result = await runQuery(
      'INSERT INTO gifts (person_id, description, link, purchased, order_index) VALUES (?, ?, ?, ?, ?)',
      [personId, description, link || null, isPurchased, newOrder]
    );
    
    res.status(201).json({ id: result.lastID, person_id: personId, description, link, purchased: isPurchased, order_index: newOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/gifts/:id', async (req, res) => {
  try {
    const { description, link, purchased } = req.body;
    const { id } = req.params;
    
    if (!description || description.trim() === '') {
      return res.status(400).json({ error: 'Description is required' });
    }
    
    const isPurchased = purchased ? 1 : 0;

    await runQuery(
      'UPDATE gifts SET description = ?, link = ?, purchased = ? WHERE id = ?',
      [description, link || null, isPurchased, id]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/gifts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runQuery('DELETE FROM gifts WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/gifts/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body; 
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare('UPDATE gifts SET order_index = ? WHERE id = ?');
      orderedIds.forEach((id, index) => {
        stmt.run(index, id);
      });
      stmt.finalize();
      db.run('COMMIT');
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
