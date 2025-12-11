const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  null;

let pool;

if (connectionString) {
  // Railway connection string method
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
} else {
  // Manual PG vars method
  pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
    ssl: { rejectUnauthorized: false }
  });
}

