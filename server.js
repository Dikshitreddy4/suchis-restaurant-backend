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

    res.send({ order_id: order.rows[0].id, message: "🧾 Order created" });
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error creating order");
  }
});

// Add Item to Order + Generate KOT
app.post("/order/add-item", async (req, res) => {
  try {
    const { order_id, item_id, quantity } = req.body;

    // fetch menu item price + gst
    const item = await pool.query(
      `SELECT price, gst_rate FROM items WHERE id = $1`,
      [item_id]
    );

    if (item.rows.length === 0)
      return res.status(400).send("❌ Item not found");

    const price = item.rows[0].price;
    const gst_rate = item.rows[0].gst_rate;

    // insert into order_items
    await pool.query(
      `INSERT INTO order_items (order_id, item_id, quantity, price, gst_rate)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, item_id, quantity, price, gst_rate]
    );

    // insert into KOT
    await pool.query(
      `INSERT INTO kot (order_id, item_id, quantity)
       VALUES ($1, $2, $3)`,
      [order_id, item_id, quantity]
    );

    res.send("🍽 Item added + KOT generated");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error adding item");
  }
});

// Get Order Details
app.get("/order/details/:order_id", async (req, res) => {
  try {
    const order = await pool.query(
      `SELECT * FROM orders WHERE id = $1`,
      [req.params.order_id]
    );

    const items = await pool.query(
      `SELECT oi.*, i.name 
       FROM order_items oi
       JOIN items i ON oi.item_id = i.id
       WHERE order_id = $1`,
      [req.params.order_id]
    );

    res.json({
      order: order.rows[0],
      items: items.rows
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error fetching order");
  }
});

// Update Order Status (Pending → Completed → Billed)
app.put("/order/status/:id", async (req, res) => {
  try {
    const { status } = req.body;

    await pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2`,
      [status, req.params.id]
    );

    res.send("🔄 Order status updated");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error updating order status");
  }
});

// Get all Open Orders for Billing Screen
app.get("/order/list/:branch_id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM orders 
       WHERE branch_id = $1 
       ORDER BY created_at DESC`,
      [req.params.branch_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error fetching orders");
  }
});

// Get Pending KOT for Kitchen Display
app.get("/kot/pending/:branch_id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT k.*, i.name 
       FROM kot k
       JOIN items i ON k.item_id = i.id
       JOIN orders o ON o.id = k.order_id
       WHERE o.branch_id = $1 AND k.kot_status = 'PENDING'
       ORDER BY k.created_at ASC`,
      [req.params.branch_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error fetching KOTs");
  }
});

// Mark KOT as Completed
app.put("/kot/complete/:kot_id", async (req, res) => {
  try {
    await pool.query(
      `UPDATE kot SET kot_status = 'COMPLETED' WHERE id = $1`,
      [req.params.kot_id]
    );

    res.send("👨‍🍳 KOT completed");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error updating KOT");
  }
});
// ------------------------------
// BILLING + GST SYSTEM
// ------------------------------

// Generate Bill (final bill for order)
app.post("/billing/generate/:order_id", async (req, res) => {
  try {
    const order_id = req.params.order_id;
    const { payment_method, branch_id } = req.body;

    // Get all items in order
    const items = await pool.query(
      `SELECT quantity, price, gst_rate
       FROM order_items WHERE order_id = $1`,
      [order_id]
    );

    if (items.rows.length === 0) {
      return res.status(400).send("❌ No items found for order");
    }

    // Calculate amounts
    let subtotal = 0;
    let gst_amount = 0;

    items.rows.forEach(i => {
      const item_total = i.quantity * i.price;
      const item_gst = item_total * (i.gst_rate / 100);

      subtotal += item_total;
      gst_amount += item_gst;
    });

    const net_amount = subtotal + gst_amount;

    // Save into transactions table
    await pool.query(
      `INSERT INTO transactions (order_id, branch_id, total_amount, gst_amount, net_amount, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [order_id, branch_id, subtotal, gst_amount, net_amount, payment_method]
    );

    // Update order status
    await pool.query(
      `UPDATE orders SET total_amount = $1, gst_amount = $2, net_amount = $3, status = 'BILLED'
       WHERE id = $4`,
      [subtotal, gst_amount, net_amount, order_id]
    );

    res.json({
      message: "🧾 Bill generated successfully",
      subtotal,
      gst_amount,
      net_amount
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error generating bill");
  }
});

// View Bill for order
app.get("/billing/view/:order_id", async (req, res) => {
  try {
    const bill = await pool.query(
      `SELECT * FROM transactions WHERE order_id = $1`,
      [req.params.order_id]
    );

    if (bill.rows.length === 0) {
      return res.status(404).send("❌ Bill not found");
    }

    res.json(bill.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error loading bill");
  }
});
// ------------------------------
// INVENTORY MANAGEMENT
// ------------------------------

// Add Inventory Item
app.post("/inventory/add", async (req, res) => {
  try {
    const { branch_id, item_name, stock, low_stock_alert } = req.body;

    await pool.query(
      `INSERT INTO inventory (branch_id, item_name, stock, low_stock_alert)
       VALUES ($1, $2, $3, $4)`,
      [branch_id, item_name, stock, low_stock_alert]
    );

    res.send("📦 Inventory item added");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error adding inventory item");
  }
});

// Update Stock (Manual Addition or Correction)
app.put("/inventory/update/:id", async (req, res) => {
  try {
    const { stock } = req.body;

    await pool.query(
      `UPDATE inventory SET stock = $1 WHERE id = $2`,
      [stock, req.params.id]
    );

    res.send("🔄 Stock updated");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error updating stock");
  }
});

// Get Inventory for a Branch
app.get("/inventory/list/:branch_id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM inventory WHERE branch_id = $1 ORDER BY id ASC`,
      [req.params.branch_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error loading inventory");
  }
});

// Low Stock Alerts
app.get("/inventory/alerts/:branch_id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM inventory 
       WHERE branch_id = $1 AND stock <= low_stock_alert`,
      [req.params.branch_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error loading low stock alerts");
  }
});
// ------------------------------
// CUSTOMER MANAGEMENT
// ------------------------------

// Add Customer
app.post("/customer/add", async (req, res) => {
  try {
    const { name, phone } = req.body;

    await pool.query(
      `INSERT INTO customers (name, phone)
       VALUES ($1, $2)`,
      [name, phone]
    );

    res.send("👤 Customer added");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error adding customer");
  }
});

// Update Customer
app.put("/customer/update/:id", async (req, res) => {
  try {
    const { name, phone } = req.body;

    await pool.query(
      `UPDATE customers SET name = $1, phone = $2 WHERE id = $3`,
      [name, phone, req.params.id]
    );

    res.send("🔄 Customer updated");
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error updating customer");
  }
});

// Get Customer Info
app.get("/customer/:id", async (req, res) => {
  try {
    const customer = await pool.query(
      `SELECT * FROM customers WHERE id = $1`,
      [req.params.id]
    );

    if (customer.rows.length === 0)
      return res.status(404).send("❌ Customer not found");

    res.json(customer.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error loading customer");
  }
});

// List All Customers
app.get("/customers", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM customers ORDER BY id DESC`);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Error loading customers");
  }
});






