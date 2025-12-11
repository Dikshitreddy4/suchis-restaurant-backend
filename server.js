// ------------------------------
// Required Imports
// ------------------------------
const express = require('express');
const { Pool } = require('pg'); 
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
// FULL INIT — CREATE ALL ERP TABLES
// ------------------------------
app.get("/init", async (req, res) => {
  try {
    // 1. Branches
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255)
      );
    `);

    // 2. Menu Items
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

    // 3. Orders
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

    // 4. Order Items
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

    // 5. KOT (Kitchen Order Tickets)
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

    // 6. Inventory
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        branch_id INT REFERENCES branches(id),
        item_name VARCHAR(255) NOT NULL,
        stock INT DEFAULT 0,
        low_stock_alert INT DEFAULT 5
      );
    `);

    // 7. Customers
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        phone VARCHAR(20),
        total_spent NUMERIC(10,2) DEFAULT 0,
        visits INT DEFAULT 0
      );
    `);

    // 8. Billing Transactions
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
// Start Server
// ------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
// ------------------------------
// MENU MANAGEMENT
// ------------------------------

// Add Item
app.post("/menu/add", async (req, res) => {
  try {
    const { branch_id, name, price, gst_rate, category } = req.body;

    await pool.query(`
      INSERT INTO items (branch_id, name, price, gst_rate, category)
      VALUES ($1, $2, $3, $4, $5)
    `, [branch_id, name, price, gst_rate, category]);

    res.send("✅ Item added successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error adding item");
  }
});

// Update Item
app.put("/menu/update/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { name, price, gst_rate, category, is_available } = req.body;

    await pool.query(`
      UPDATE items
      SET name = $1, price = $2, gst_rate = $3, category = $4, is_available = $5
      WHERE id = $6
    `, [name, price, gst_rate, category, is_available, id]);

    res.send("✅ Item updated successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error updating item");
  }
});

// Delete Item
app.delete("/menu/delete/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM items WHERE id = $1`, [req.params.id]);
    res.send("🗑 Item deleted successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error deleting item");
  }
});

// Get All Items
app.get("/menu/list/:branch_id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM items WHERE branch_id = $1 ORDER BY id ASC`,
      [req.params.branch_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error fetching items");
  }
});

// Update Availability (in stock / out of stock)
app.put("/menu/availability/:id", async (req, res) => {
  try {
    const { is_available } = req.body;

    await pool.query(
      `UPDATE items SET is_available = $1 WHERE id = $2`,
      [is_available, req.params.id]
    );

    res.send("🔄 Availability updated");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error updating availability");
  }
});




