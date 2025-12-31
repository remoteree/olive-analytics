import mongoose from 'mongoose';
import Invoice, { InvoiceStatus } from '../models/Invoice';
import { downloadFile, moveFile, getFileExtension, getFolderId } from '../services/googleDrive';
import { uploadToS3, getS3Key } from '../services/s3';
import { extractInvoiceData } from '../services/ocr';
import { resolveOrCreateShop, resolveOrCreateSupplier, resolveOrCreateParts } from '../services/entityResolution';
import { classifyPurchaseContext } from '../services/llm';
import { generateSavingsRecommendations, calculateRecommendationSummary } from '../services/perplexity';
import { analyzeTrends } from '../services/trendAnalysis';
import crypto from 'crypto';

const MAX_RETRY_ATTEMPTS = 3;
const STUCK_INVOICE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function processInvoice(): Promise<Invoice | null> {
  const startTime = Date.now();
  
  // Step 1: Acquire and lock one invoice
  console.log(`[${new Date().toISOString()}] [ACQUIRE] Attempting to acquire and lock an invoice...`);
  const invoice = await acquireAndLockInvoice();
  
  if (!invoice) {
    console.log(`[${new Date().toISOString()}] [ACQUIRE] No invoices available for processing`);
    return null; // No invoice to process
  }
  
  console.log(`[${new Date().toISOString()}] [ACQUIRE] ✓ Locked invoice ${invoice._id} (shop: ${invoice.shopId}, attempt: ${invoice.processing.attempts + 1}/${MAX_RETRY_ATTEMPTS})`);
  
  try {
    await processInvoiceStages(invoice);
    
    // Step 7: Finalize - move to processed
    console.log(`[${new Date().toISOString()}] [FINALIZE] Moving invoice ${invoice._id} to processed status...`);
    invoice.status = 'processed';
    invoice.processing.stage = 'completed';
    
    // Move Drive file to processed folder
    try {
      const processedFolderId = await getFolderId(invoice.shopId, 'processed');
      if (invoice.driveFileId) {
        console.log(`[${new Date().toISOString()}] [FINALIZE] Moving Drive file ${invoice.driveFileId} to processed folder...`);
        await moveFile(invoice.driveFileId, processedFolderId);
        console.log(`[${new Date().toISOString()}] [FINALIZE] ✓ Drive file moved successfully`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [FINALIZE] ✗ Failed to move file to processed folder: ${error}`);
      // Don't fail the whole process if Drive move fails
    }
    
    await invoice.save();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${new Date().toISOString()}] [SUCCESS] Invoice ${invoice._id} processed successfully in ${duration}s`);
    console.log(`[${new Date().toISOString()}] [SUCCESS]   - Shop: ${invoice.shopId}`);
    console.log(`[${new Date().toISOString()}] [SUCCESS]   - Invoice #: ${invoice.invoiceNumber || 'N/A'}`);
    console.log(`[${new Date().toISOString()}] [SUCCESS]   - Total: $${invoice.totals?.total?.toFixed(2) || '0.00'}`);
    console.log(`[${new Date().toISOString()}] [SUCCESS]   - Line items: ${invoice.lineItems.length}`);
    console.log(`[${new Date().toISOString()}] [SUCCESS]   - Recommendations: ${invoice.recommendations.length}`);
    
    return invoice;
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[${new Date().toISOString()}] [ERROR] Error processing invoice ${invoice._id} after ${duration}s:`, error.message || error);
    
    invoice.processing.attempts += 1;
    invoice.processing.lastError = error.message || String(error);
    
    if (invoice.processing.attempts >= MAX_RETRY_ATTEMPTS) {
      // Max retries reached, mark as failed
      console.error(`[${new Date().toISOString()}] [FAILED] Invoice ${invoice._id} exceeded max retry attempts (${MAX_RETRY_ATTEMPTS}). Marking as failed.`);
      invoice.status = 'failed';
      invoice.processing.stage = 'failed';
      
      // Move Drive file to failed folder
      try {
        const failedFolderId = await getFolderId(invoice.shopId, 'failed');
        if (invoice.driveFileId) {
          console.log(`[${new Date().toISOString()}] [FAILED] Moving Drive file ${invoice.driveFileId} to failed folder...`);
          await moveFile(invoice.driveFileId, failedFolderId);
          console.log(`[${new Date().toISOString()}] [FAILED] ✓ Drive file moved to failed folder`);
        }
      } catch (moveError) {
        console.error(`[${new Date().toISOString()}] [FAILED] ✗ Failed to move file to failed folder: ${moveError}`);
      }
    } else {
      // Retry - reset to queued
      console.log(`[${new Date().toISOString()}] [RETRY] Resetting invoice ${invoice._id} to queued for retry (attempt ${invoice.processing.attempts}/${MAX_RETRY_ATTEMPTS})`);
      invoice.status = 'queued';
      invoice.processing.stage = 'queued';
      invoice.processing.lockedAt = undefined;
    }
    
    await invoice.save();
    
    throw error; // Re-throw to trigger retry logic in worker
  }
}

async function acquireAndLockInvoice(): Promise<Invoice | null> {
  // First, check for and unlock stuck invoices (locked for too long)
  await unlockStuckInvoices();
  
  // Atomically find and lock one queued invoice
  const invoice = await Invoice.findOneAndUpdate(
    {
      status: 'queued',
      'processing.attempts': { $lt: MAX_RETRY_ATTEMPTS },
    },
    {
      $set: {
        status: 'processing' as InvoiceStatus,
        'processing.stage': 'acquired',
        'processing.lockedAt': new Date(),
      },
    },
    {
      new: true,
      sort: { createdAt: 1 }, // Process oldest first
    }
  );
  
  return invoice;
}

/**
 * Unlock invoices that have been stuck in processing state for too long
 */
async function unlockStuckInvoices(): Promise<void> {
  const timeoutThreshold = new Date(Date.now() - STUCK_INVOICE_TIMEOUT_MS);
  
  const stuckInvoices = await Invoice.find({
    status: 'processing',
    'processing.lockedAt': { $lt: timeoutThreshold },
  });
  
  if (stuckInvoices.length > 0) {
    console.log(`[${new Date().toISOString()}] [STUCK] Found ${stuckInvoices.length} stuck invoice(s), unlocking...`);
    
    for (const invoice of stuckInvoices) {
      const lockedDuration = Math.round((Date.now() - (invoice.processing.lockedAt?.getTime() || 0)) / 1000 / 60);
      console.log(`[${new Date().toISOString()}] [STUCK] Unlocking invoice ${invoice._id} (stuck for ${lockedDuration} minutes, stage: ${invoice.processing.stage})`);
      
      invoice.status = 'queued';
      invoice.processing.stage = 'queued';
      invoice.processing.lockedAt = undefined;
      invoice.processing.lastError = `Invoice was stuck in processing for ${lockedDuration} minutes. Automatically unlocked.`;
      
      await invoice.save();
    }
    
    console.log(`[${new Date().toISOString()}] [STUCK] ✓ Unlocked ${stuckInvoices.length} stuck invoice(s)`);
  }
}

async function processInvoiceStages(invoice: Invoice): Promise<void> {
  // Stage 1: Download invoice
  console.log(`[${new Date().toISOString()}] [STAGE 1/9] DOWNLOADING - Downloading invoice file from Google Drive...`);
  invoice.processing.stage = 'downloading';
  await invoice.save();
  
  if (!invoice.driveFileId) {
    throw new Error('Invoice missing driveFileId');
  }
  
  const { buffer, mimeType, name } = await downloadFile(invoice.driveFileId);
  const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
  console.log(`[${new Date().toISOString()}] [STAGE 1/9] DOWNLOADING ✓ Downloaded file "${name}" (${fileSizeMB}MB, ${mimeType})`);
  
  // Stage 2: Compute hash and check for duplicates
  console.log(`[${new Date().toISOString()}] [STAGE 2/9] HASHING - Computing SHA-256 hash and checking for duplicates...`);
  invoice.processing.stage = 'hashing';
  await invoice.save();
  
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  invoice.hashSha256 = hash;
  console.log(`[${new Date().toISOString()}] [STAGE 2/9] HASHING ✓ Hash computed: ${hash.substring(0, 16)}...`);
  
  // Check for duplicate
  const duplicate = await Invoice.findOne({
    hashSha256: hash,
    _id: { $ne: invoice._id },
  });
  
  if (duplicate) {
    throw new Error(`Duplicate invoice detected: ${duplicate._id}`);
  }
  console.log(`[${new Date().toISOString()}] [STAGE 2/9] HASHING ✓ No duplicate found`);
  
  // Stage 3: Upload to S3
  console.log(`[${new Date().toISOString()}] [STAGE 3/9] UPLOADING - Uploading original invoice to S3...`);
  invoice.processing.stage = 'uploading';
  await invoice.save();
  
  const extension = getFileExtension(mimeType);
  const originalS3Key = getS3Key(invoice.shopId, invoice._id.toString(), 'original', extension);
  await uploadToS3(originalS3Key, buffer, mimeType);
  invoice.originalS3Key = originalS3Key;
  console.log(`[${new Date().toISOString()}] [STAGE 3/9] UPLOADING ✓ Original invoice uploaded to S3: ${originalS3Key}`);
  
  // Stage 4: OCR & structured extraction
  console.log(`[${new Date().toISOString()}] [STAGE 4/9] EXTRACTING - Running OCR and extracting structured data...`);
  invoice.processing.stage = 'extracting';
  await invoice.save();
  
  const extractedData = await extractInvoiceData(buffer, mimeType);
  
  invoice.invoiceNumber = extractedData.invoiceNumber;
  invoice.invoiceDate = extractedData.invoiceDate;
  invoice.totals = extractedData.totals;
  invoice.lineItems = extractedData.lineItems;
  console.log(`[${new Date().toISOString()}] [STAGE 4/9] EXTRACTING ✓ Extracted data:`);
  console.log(`[${new Date().toISOString()}] [STAGE 4/9] EXTRACTING   - Supplier: ${extractedData.supplierName}`);
  console.log(`[${new Date().toISOString()}] [STAGE 4/9] EXTRACTING   - Invoice #: ${extractedData.invoiceNumber || 'N/A'}`);
  console.log(`[${new Date().toISOString()}] [STAGE 4/9] EXTRACTING   - Date: ${extractedData.invoiceDate?.toISOString().split('T')[0] || 'N/A'}`);
  console.log(`[${new Date().toISOString()}] [STAGE 4/9] EXTRACTING   - Total: $${extractedData.totals.total.toFixed(2)}`);
  console.log(`[${new Date().toISOString()}] [STAGE 4/9] EXTRACTING   - Line items: ${extractedData.lineItems.length}`);
  
  // Stage 5: Entity resolution
  console.log(`[${new Date().toISOString()}] [STAGE 5/9] RESOLVING ENTITIES - Resolving/creating shop, supplier, and parts...`);
  invoice.processing.stage = 'resolving_entities';
  await invoice.save();
  
  await resolveOrCreateShop(invoice.shopId);
  console.log(`[${new Date().toISOString()}] [STAGE 5/9] RESOLVING ENTITIES ✓ Shop resolved: ${invoice.shopId}`);
  
  const supplierIdStr = await resolveOrCreateSupplier(extractedData.supplierName);
  invoice.supplierId = new mongoose.Types.ObjectId(supplierIdStr);
  console.log(`[${new Date().toISOString()}] [STAGE 5/9] RESOLVING ENTITIES ✓ Supplier resolved: ${extractedData.supplierName} (ID: ${supplierIdStr})`);
  
  await resolveOrCreateParts(extractedData.lineItems);
  console.log(`[${new Date().toISOString()}] [STAGE 5/9] RESOLVING ENTITIES ✓ Parts resolved: ${extractedData.lineItems.length} items`);
  
  // Stage 6: Context classification
  console.log(`[${new Date().toISOString()}] [STAGE 6/9] CLASSIFYING CONTEXT - Analyzing purchase context with AI...`);
  invoice.processing.stage = 'classifying_context';
  await invoice.save();
  
  const context = await classifyPurchaseContext(
    extractedData.supplierName,
    extractedData.lineItems,
    extractedData.invoiceDate || new Date(),
    extractedData.totals
  );
  invoice.context = context;
  console.log(`[${new Date().toISOString()}] [STAGE 6/9] CLASSIFYING CONTEXT ✓ Context classified:`);
  console.log(`[${new Date().toISOString()}] [STAGE 6/9] CLASSIFYING CONTEXT   - Type: ${context.purchaseType}`);
  console.log(`[${new Date().toISOString()}] [STAGE 6/9] CLASSIFYING CONTEXT   - Confidence: ${(context.confidence * 100).toFixed(0)}%`);
  
  // Stage 7: Trend analysis
  console.log(`[${new Date().toISOString()}] [STAGE 7/9] ANALYZING TRENDS - Comparing with historical data...`);
  invoice.processing.stage = 'analyzing_trends';
  await invoice.save();
  
  const trendAnalysis = await analyzeTrends(invoice.shopId, supplierIdStr, invoice);
  invoice.trendAnalysis = trendAnalysis;
  if (trendAnalysis.priceChangePercent !== undefined) {
    console.log(`[${new Date().toISOString()}] [STAGE 7/9] ANALYZING TRENDS ✓ Trend analysis complete:`);
    console.log(`[${new Date().toISOString()}] [STAGE 7/9] ANALYZING TRENDS   - Price change: ${trendAnalysis.priceChangePercent > 0 ? '+' : ''}${trendAnalysis.priceChangePercent.toFixed(1)}%`);
    if (trendAnalysis.anomalies && trendAnalysis.anomalies.length > 0) {
      console.log(`[${new Date().toISOString()}] [STAGE 7/9] ANALYZING TRENDS   - Anomalies: ${trendAnalysis.anomalies.length}`);
    }
  } else {
    console.log(`[${new Date().toISOString()}] [STAGE 7/9] ANALYZING TRENDS ✓ No historical data available for comparison`);
  }
  
  // Stage 8: Generate savings recommendations
  console.log(`[${new Date().toISOString()}] [STAGE 8/9] GENERATING RECOMMENDATIONS - Finding savings opportunities...`);
  invoice.processing.stage = 'generating_recommendations';
  await invoice.save();
  
  const recommendations = await generateSavingsRecommendations(
    extractedData.supplierName,
    extractedData.lineItems,
    extractedData.totals
  );
  invoice.recommendations = recommendations;
  console.log(`[${new Date().toISOString()}] [STAGE 8/9] GENERATING RECOMMENDATIONS ✓ Generated ${recommendations.length} recommendations`);
  if (recommendations.length > 0) {
    const summary = calculateRecommendationSummary(recommendations, extractedData.totals.total);
    console.log(`[${new Date().toISOString()}] [STAGE 8/9] GENERATING RECOMMENDATIONS   - Estimated savings: $${summary.estimatedTotalSavings.toFixed(2)} (${summary.estimatedTotalSavingsPercent.toFixed(1)}%)`);
    console.log(`[${new Date().toISOString()}] [STAGE 8/9] GENERATING RECOMMENDATIONS   - Savings range: $${summary.totalSavingsRange.min.toFixed(2)} - $${summary.totalSavingsRange.max.toFixed(2)} (${summary.totalSavingsPercentRange.min.toFixed(1)}% - ${summary.totalSavingsPercentRange.max.toFixed(1)}%)`);
  }
  
  // Stage 9: Persist processed data to S3
  console.log(`[${new Date().toISOString()}] [STAGE 9/9] PERSISTING - Saving processed data to S3...`);
  invoice.processing.stage = 'persisting';
  await invoice.save();
  
  const processedData = {
    extractedData,
    context,
    trendAnalysis,
    recommendations,
    processedAt: new Date().toISOString(),
  };
  
  const processedS3Key = getS3Key(invoice.shopId, invoice._id.toString(), 'processed');
  await uploadToS3(processedS3Key, Buffer.from(JSON.stringify(processedData, null, 2)), 'application/json');
  invoice.processedS3Key = processedS3Key;
  console.log(`[${new Date().toISOString()}] [STAGE 9/9] PERSISTING ✓ Processed data saved to S3: ${processedS3Key}`);
}

