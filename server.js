// ------------------------------
// Required Imports
// ------------------------------
const express = require("express");
const { Pool } = require("pg");
const app = express();
app.use(express.json());

// ------------------------------
// Database Connection
// ------------------------------
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  null;

let pool;

if (connectionString) {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  console.log("Connected using DATABASE_URL / POSTGRES_URL");
} else {
  pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
    ssl: { rejectUnauthorized: false }
  });
  console.log("Connected using manual PG variables");
}

// ------------------------------
// Test Route
// ------------------------------
app.get("/", (req, res) => {
  res.send("Suchi's Restaurant Backend is running!");
});

// ------------------------------
// INIT DATABASE TABLES
// ------------------------------
app.get("/init", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        branch_id INT REFERENCES branches(id),
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        gst_rate NUMERIC(5,2) DEFAULT 0,
        category VARCHAR(100),
        is_available BOOLEAN DEFAULT TRUE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        branch_id INT REFERENCES branches(id),
        order_type VARCHAR(20) NOT NULL,
        table_no VARCHAR(20),
        customer_id INT,
        total_amount NUMERIC(10,2) DEFAULT 0,
        gst_amount NUMERIC(10,2) DEFAULT 0,
        net_amount NUMERIC(10,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id),
        item_id INT REFERENCES items(id),
        quantity INT NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        gst_rate NUMERIC(5,2),
        status VARCHAR(20) DEFAULT 'PENDING'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS kot (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id),
        item_id INT REFERENCES items(id),
        quantity INT NOT NULL,
        kot_status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        branch_id INT REFERENCES branches(id),
        item_name VARCHAR(255) NOT NULL,
        stock INT DEFAULT 0,
        low_stock_alert INT DEFAULT 5
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        phone VARCHAR(20),
        total_spent NUMERIC(10,2) DEFAULT 0,
        visits INT DEFAULT 0
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id),
        branch_id INT REFERENCES branches(id),
        total_amount NUMERIC(10,2),
        gst_amount NUMERIC(10,2),
        net_amount NUMERIC(10,2),
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    res.send("✅ ALL ERP TABLES CREATED SUCCESSFULLY");
  } catch (err) {
    console.error("Error creating tables:", err);
    res.status(500).send("❌ Error creating tables");
  }
});

// ------------------------------
// MENU MANAGEMENT
// ------------------------------

// Add Item
app.post("/menu/add", async (req, res) => {
  try {
    const { branch_id, name, price, gst_rate, category } = req.body;

    await pool.query(
      `INSERT INTO items (branch_id, name, price, gst_rate, category)
       VALUES ($1, $2, $3, $4, $5)`,
      [branch_id, name, price, gst_rate, category]
    );

    res.send("✅ Item added successfully");
  } catch (error) {
    console.error("ADD ITEM ERROR:", error);
    res.status(500).send("❌ Error adding item");
  }
});

// List Items
app.get("/menu/list/:branch_id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM items WHERE branch_id = $1 ORDER BY id ASC`,
      [req.params.branch_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("FETCH ITEMS ERROR:", error);
    res.status(500).send("❌ Error fetching items");
  }
});

// ------------------------------
// ORDER + KOT + BILLING SYSTEM
// (REMOVED HERE TO KEEP FILE SHORT, CAN ADD WHEN NEEDED)
// ------------------------------

// ------------------------------
// START SERVER — REQUIRED FOR RAILWAY
// ------------------------------
const PORT = process.env.PORT;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on Railway port: ${PORT}`);
});







