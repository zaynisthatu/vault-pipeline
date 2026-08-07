const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const db = new sqlite3.Database('./vault_local.db', (err) => {
    if (err) console.error("Database connection error:", err);
    else console.log("SQLite Local Vector Vault connected.");
});

// Database Initialization
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS KnowledgeVault (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        vector_blob BLOB,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Vector Retrieval Endpoint
app.post('/api/vault/query', (req, res) => {
    const { query_vector, limit = 5 } = req.body;
    db.all(`SELECT id, title, content, category FROM KnowledgeVault LIMIT ?`, [limit], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ results: rows });
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`VAULT Backend Engine running on port ${PORT}`));