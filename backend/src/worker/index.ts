import dotenv from 'dotenv';
import { resolve } from 'path';
import { connectDB } from '../config/database';
import { processInvoice } from './processor';

// Load .env file from backend directory (relative to compiled dist folder)
// When running from src/, go up two levels to backend root
dotenv.config({ path: resolve(process.cwd(), '.env') });

const PROCESSING_INTERVAL_MS = 5000; // Check every 5 seconds
const STUCK_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check for stuck invoices every 5 minutes

let lastStuckCheck = 0;

async function workerLoop() {
  try {
    // Periodically check for stuck invoices (every 5 minutes)
    const now = Date.now();
    if (now - lastStuckCheck > STUCK_CHECK_INTERVAL_MS) {
      console.log(`[${new Date().toISOString()}] [STUCK CHECK] Running periodic check for stuck invoices...`);
      lastStuckCheck = now;
      // The unlockStuckInvoices function is called in acquireAndLockInvoice
    }
    
    console.log(`[${new Date().toISOString()}] Checking for queued invoices...`);
    const invoice = await processInvoice();
    
    if (!invoice) {
      // No invoice to process, wait and check again
      console.log(`[${new Date().toISOString()}] No invoices in queue. Waiting ${PROCESSING_INTERVAL_MS}ms before next check.`);
      setTimeout(workerLoop, PROCESSING_INTERVAL_MS);
      return;
    }
    
    // Invoice processed, immediately check for next one
    console.log(`[${new Date().toISOString()}] Invoice ${invoice._id} processing completed. Checking for next invoice...`);
    setImmediate(workerLoop);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Worker loop error:`, error);
    // Wait before retrying on error
    setTimeout(workerLoop, PROCESSING_INTERVAL_MS);
  }
}

async function startWorker() {
  console.log('Starting invoice processing worker...');
  
  try {
    await connectDB();
    console.log('Worker connected to database');
    
    // Start the worker loop
    workerLoop();
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Worker shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Worker shutting down gracefully...');
  process.exit(0);
});

startWorker();

