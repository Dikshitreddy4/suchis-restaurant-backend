const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection (Railway auto injects vars)
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false }
});

// Health check
app.get("/", (req, res) => {
  res.send("✅ Suchi's Restaurant Backend is running");
});

// Create tables automatically
app.get("/init", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        subtotal NUMERIC,
        gst NUMERIC,
        total NUMERIC,
        payment_mode TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    res.send("✅ Tables initialized");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error creating tables");
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
                     
