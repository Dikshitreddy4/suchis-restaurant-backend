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
    // Branches
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255)
      );
    `);

    // Menu Items
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

    // Orders
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

    // Order Items
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

    // KOT
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

    // Inventory
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        branch_id INT REFERENCES branches(id),
        item_name VARCHAR(255) NOT NULL,
        stock INT DEFAULT 0,
        low_stock_alert INT DEFAULT 5
      );
    `);

    // Customers
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        phone VARCHAR(20),
        total_spent NUMERIC(10,2) DEFAULT 0,
        visits INT DEFAULT 0
      );
    `);

    // Transactions
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
    res.status(500).send("❌ Error adding item");
  }
});

// List Menu Items
app.get("/menu/list/:branch_id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM items WHERE branch_id = $1 ORDER BY id ASC`,
      [req.params.branch_id]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).send("❌ Error fetching items");
  }
});

// ------------------------------
// ORDER MANAGEMENT + KOT SYSTEM
// ------------------------------

// Create Order
app.post("/order/create", async (req, res) => {
  try {
    const { branch_id, order_type, table_no, customer_id } = req.body;

    const order = await pool.query(
      `INSERT INTO orders (branch_id, order_type, table_no, customer_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [branch_id, order_type, table_no, customer_id]
    );

    res.json({ order_id: order.rows[0].id });
  } catch (error) {
    res.status(500).send("❌ Error creating order");
  }
});

// Add Item to Order
app.post("/order/add-item", async (req, res) => {
  try {
    const { order_id, item_id, quantity } = req.body;

    const item = await pool.query(
      `SELECT price, gst_rate FROM items WHERE id = $1`,
      [item_id]
    );

    if (!item.rows.length) return res.status(404).send("Item not found");

    const price = item.rows[0].price;
    const gst_rate = item.rows[0].gst_rate;

    await pool.query(
      `INSERT INTO order_items (order_id, item_id, quantity, price, gst_rate)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, item_id, quantity, price, gst_rate]
    );

    await pool.query(
      `INSERT INTO kot (order_id, item_id, quantity)
       VALUES ($1, $2, $3)`,
      [order_id, item_id, quantity]
    );

    res.send("🍽 Item added + KOT generated");
  } catch (error) {
    res.status(500).send("❌ Error adding item to order");
  }
});

// ------------------------------
// BILLING SYSTEM
// ------------------------------
app.post("/billing/generate/:order_id", async (req, res) => {
  try {
    const order_id = req.params.order_id;
    const { payment_method, branch_id } = req.body;

    const items = await pool.query(
      `SELECT quantity, price, gst_rate FROM order_items WHERE order_id = $1`,
      [order_id]
    );

    if (!items.rows.length)
      return res.status(400).send("❌ No items found");

    let subtotal = 0,
      gst_amount = 0;

    items.rows.forEach(i => {
      const total = i.quantity * i.price;
      subtotal += total;
      gst_amount += total * (i.gst_rate / 100);
    });

    const net_amount = subtotal + gst_amount;

    await pool.query(
      `INSERT INTO transactions (order_id, branch_id, total_amount, gst_amount, net_amount, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [order_id, branch_id, subtotal, gst_amount, net_amount, payment_method]
    );

    await pool.query(
      `UPDATE orders SET total_amount=$1, gst_amount=$2, net_amount=$3, status='BILLED'
       WHERE id=$4`,
      [subtotal, gst_amount, net_amount, order_id]
    );

    res.json({ subtotal, gst_amount, net_amount });
  } catch (error) {
    res.status(500).send("❌ Error generating bill");
  }
});

// ------------------------------
// START SERVER (MUST BE LAST)
// ------------------------------
// ------------------------------
// START SERVER (IMPORTANT FOR RAILWAY)
// ------------------------------
const PORT = process.env.PORT;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on Railway Port: ${PORT}`);
});








