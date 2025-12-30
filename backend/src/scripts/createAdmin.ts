/**
 * Script to create an admin user
 * Usage: 
 *   npm run create-admin <email> <password>
 *   or
 *   tsx src/scripts/createAdmin.ts <email> <password>
 * 
 * Options:
 *   --force: Allow creating admin even if one already exists
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import User from '../models/User';

dotenv.config();

async function createAdmin(email: string, password: string, force: boolean = false) {
  try {
    await connectDB();
    console.log('Connecting to database...');
    
    // Check if admin already exists (unless --force flag is used)
    if (!force) {
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        console.log('⚠️  Admin user already exists.');
        console.log('   To create additional admins, use:');
        console.log('   - The signup endpoint (requires admin authentication)');
        console.log('   - This script with --force flag: npm run create-admin -- --force <email> <password>');
        process.exit(0);
      }
    }
    
    // Check if user with email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.error(`❌ User with email "${email}" already exists`);
      console.error(`   Existing user role: ${existingUser.role}`);
      process.exit(1);
    }
    
    // Validate password
    if (password.length < 8) {
      console.error('❌ Password must be at least 8 characters long');
      process.exit(1);
    }
    
    // Create admin user
    console.log(`Creating admin user with email: ${email}...`);
    const admin = new User({
      email: email.toLowerCase(),
      password,
      role: 'admin',
      isTemporaryPassword: false,
    });
    
    await admin.save();
    
    console.log('\n✅ Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email: ${admin.email}`);
    console.log(`Role: ${admin.role}`);
    console.log(`ID: ${admin._id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating admin:', error.message);
    if (error.code === 11000) {
      console.error('   Duplicate email detected');
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const forceIndex = args.indexOf('--force');
const force = forceIndex !== -1;

// Remove --force from args if present
const cleanArgs = force ? args.filter(arg => arg !== '--force') : args;

if (cleanArgs.length < 2) {
  console.error('Usage:');
  console.error('  npm run create-admin <email> <password>');
  console.error('  npm run create-admin -- --force <email> <password>  (to create additional admins)');
  console.error('\nExample:');
  console.error('  npm run create-admin admin@example.com SecurePassword123');
  process.exit(1);
}

createAdmin(cleanArgs[0], cleanArgs[1], force);

