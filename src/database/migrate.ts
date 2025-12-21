import * as fs from 'fs';
import * as path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Look for migrations in source directory (for development) or dist (for production)
const migrationsDir = fs.existsSync(path.join(__dirname, 'migrations'))
  ? path.join(__dirname, 'migrations')
  : path.join(__dirname, '..', '..', 'src', 'database', 'migrations');

async function runMigrations() {
  // First connect without database to create it if needed
  const adminConnection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    multipleStatements: true,
  });

  const databaseName = process.env.MYSQL_DATABASE || 'payment_settlement';
  
  try {
    await adminConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
    console.log(`Database ${databaseName} ready`);
  } catch (error) {
    console.error('Error creating database:', error);
  } finally {
    await adminConnection.end();
  }

  // Now connect to the database
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: databaseName,
    multipleStatements: true,
  });

  try {
    // Create migrations table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Get applied migrations
    const [applied] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedVersions = new Set(applied.map((row) => row.version));

    // Read migration files
    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      if (appliedVersions.has(version)) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`Running migration ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await connection.query(sql);
      await connection.execute(
        'INSERT INTO schema_migrations (version) VALUES (?)',
        [version]
      );
      console.log(`✓ Applied ${file}`);
    }

    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigrations().catch(console.error);

