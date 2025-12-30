import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import { processInvoice } from './processor';

dotenv.config();

const PROCESSING_INTERVAL_MS = 5000; // Check every 5 seconds

async function workerLoop() {
  try {
    const invoice = await processInvoice();
    
    if (!invoice) {
      // No invoice to process, wait and check again
      setTimeout(workerLoop, PROCESSING_INTERVAL_MS);
      return;
    }
    
    // Invoice processed, immediately check for next one
    setImmediate(workerLoop);
  } catch (error) {
    console.error('Worker loop error:', error);
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

