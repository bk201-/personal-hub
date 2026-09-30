/**
 * Creates the initial admin user in the database.
 * Usage: npm run auth:create-user -- <email> <password>
 * Example: npm run auth:create-user -- admin@example.com MySecurePassword123!
 */
import 'dotenv/config';
import { db } from '../src/server/db/index.js';
import { users } from '../src/server/db/schema.js';
import { runMigration } from '../src/server/db/migrate.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: npm run auth:create-user -- <email> <password>');
  console.error('Example: npm run auth:create-user -- admin@example.com MyPassword123!');
  process.exit(1);
}

if (password.length < 8) {
  console.error('❌ Password must be at least 8 characters');
  process.exit(1);
}

// Ensure tables exist before inserting
await runMigration();

const normalizedEmail = email.toLowerCase().trim();

const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail));
if (existing) {
  console.log(`⚠️  User "${normalizedEmail}" already exists (id: ${existing.id})`);
  process.exit(0);
}

const passwordHash = await bcrypt.hash(password, 12);
const [user] = await db
  .insert(users)
  .values({
    email: normalizedEmail,
    passwordHash,
    role: 'admin',
  })
  .returning();

console.log(`✅ Admin user created:`);
console.log(`   Email: ${user.email}`);
console.log(`   ID:    ${user.id}`);
console.log(`   Role:  ${user.role}`);
process.exit(0);

