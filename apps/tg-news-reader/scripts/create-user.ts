/**
 * Creates the initial admin user in the database.
 * Usage: npm run auth:create-user -- <email> <password>
 * Example: npm run auth:create-user -- admin@example.com MySecurePassword123!
 */
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/server/db/index.js';
import { users } from '../src/server/db/schema.js';

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

const normalizedEmail = email.toLowerCase().trim();

// Check if user already exists
const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail));
if (existing) {
  console.log(`⚠️  User "${normalizedEmail}" already exists (id: ${existing.id})`);
  console.log('To change password, update the password_hash directly in the DB or add a reset command.');
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
console.log(`   ID: ${user.id}`);
console.log(`   Role: ${user.role}`);
console.log('');
console.log('You can now log in at the app. Enable 2FA in the profile menu after first login.');
process.exit(0);
