/**
 * Helper script to create a test invoice in the database
 * Usage: tsx src/scripts/createTestInvoice.ts <shopId> <driveFileId>
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import Invoice from '../models/Invoice';
import Shop from '../models/Shop';

dotenv.config();

async function createTestInvoice(shopId: string, driveFileId?: string) {
  try {
    await connectDB();
    
    // Ensure shop exists
    let shop = await Shop.findOne({ shopId });
    if (!shop) {
      shop = new Shop({ shopId, name: `Shop ${shopId}` });
      await shop.save();
      console.log(`Created shop: ${shopId}`);
    }
    
    // Create test invoice
    const invoice = new Invoice({
      shopId,
      status: 'queued',
      driveFileId: driveFileId || 'test-file-id',
      driveUrl: driveFileId ? `https://drive.google.com/file/d/${driveFileId}` : undefined,
      processing: {
        stage: 'queued',
        attempts: 0,
      },
    });
    
    await invoice.save();
    console.log(`Created test invoice: ${invoice._id}`);
    console.log(`Status: ${invoice.status}`);
    console.log(`Shop ID: ${invoice.shopId}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating test invoice:', error);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: tsx src/scripts/createTestInvoice.ts <shopId> [driveFileId]');
  process.exit(1);
}

createTestInvoice(args[0], args[1]);



