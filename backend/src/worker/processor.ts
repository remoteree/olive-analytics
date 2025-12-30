import mongoose from 'mongoose';
import Invoice, { InvoiceStatus } from '../models/Invoice';
import { downloadFile, moveFile, getFileExtension, getFolderId } from '../services/googleDrive';
import { uploadToS3, getS3Key } from '../services/s3';
import { extractInvoiceData } from '../services/ocr';
import { resolveOrCreateShop, resolveOrCreateSupplier, resolveOrCreateParts } from '../services/entityResolution';
import { classifyPurchaseContext } from '../services/llm';
import { generateSavingsRecommendations } from '../services/perplexity';
import { analyzeTrends } from '../services/trendAnalysis';
import crypto from 'crypto';

const MAX_RETRY_ATTEMPTS = 3;

export async function processInvoice(): Promise<Invoice | null> {
  // Step 1: Acquire and lock one invoice
  const invoice = await acquireAndLockInvoice();
  
  if (!invoice) {
    return null; // No invoice to process
  }
  
  try {
    await processInvoiceStages(invoice);
    
    // Step 7: Finalize - move to processed
    invoice.status = 'processed';
    invoice.processing.stage = 'completed';
    
    // Move Drive file to processed folder
    try {
      const processedFolderId = await getFolderId(invoice.shopId, 'processed');
      if (invoice.driveFileId) {
        await moveFile(invoice.driveFileId, processedFolderId);
      }
    } catch (error) {
      console.error(`Failed to move file to processed folder: ${error}`);
      // Don't fail the whole process if Drive move fails
    }
    
    await invoice.save();
    console.log(`Invoice ${invoice._id} processed successfully`);
    
    return invoice;
  } catch (error: any) {
    console.error(`Error processing invoice ${invoice._id}:`, error);
    
    invoice.processing.attempts += 1;
    invoice.processing.lastError = error.message || String(error);
    
    if (invoice.processing.attempts >= MAX_RETRY_ATTEMPTS) {
      // Max retries reached, mark as failed
      invoice.status = 'failed';
      invoice.processing.stage = 'failed';
      
      // Move Drive file to failed folder
      try {
        const failedFolderId = await getFolderId(invoice.shopId, 'failed');
        if (invoice.driveFileId) {
          await moveFile(invoice.driveFileId, failedFolderId);
        }
      } catch (moveError) {
        console.error(`Failed to move file to failed folder: ${moveError}`);
      }
    } else {
      // Retry - reset to queued
      invoice.status = 'queued';
      invoice.processing.stage = 'queued';
      invoice.processing.lockedAt = undefined;
    }
    
    await invoice.save();
    
    throw error; // Re-throw to trigger retry logic in worker
  }
}

async function acquireAndLockInvoice(): Promise<Invoice | null> {
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

async function processInvoiceStages(invoice: Invoice): Promise<void> {
  // Stage 1: Download invoice
  invoice.processing.stage = 'downloading';
  await invoice.save();
  
  if (!invoice.driveFileId) {
    throw new Error('Invoice missing driveFileId');
  }
  
  const { buffer, mimeType, name } = await downloadFile(invoice.driveFileId);
  
  // Stage 2: Compute hash and check for duplicates
  invoice.processing.stage = 'hashing';
  await invoice.save();
  
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  invoice.hashSha256 = hash;
  
  // Check for duplicate
  const duplicate = await Invoice.findOne({
    hashSha256: hash,
    _id: { $ne: invoice._id },
  });
  
  if (duplicate) {
    throw new Error(`Duplicate invoice detected: ${duplicate._id}`);
  }
  
  // Stage 3: Upload to S3
  invoice.processing.stage = 'uploading';
  await invoice.save();
  
  const extension = getFileExtension(mimeType);
  const originalS3Key = getS3Key(invoice.shopId, invoice._id.toString(), 'original', extension);
  await uploadToS3(originalS3Key, buffer, mimeType);
  invoice.originalS3Key = originalS3Key;
  
  // Stage 4: OCR & structured extraction
  invoice.processing.stage = 'extracting';
  await invoice.save();
  
  const extractedData = await extractInvoiceData(buffer, mimeType);
  
  invoice.invoiceNumber = extractedData.invoiceNumber;
  invoice.invoiceDate = extractedData.invoiceDate;
  invoice.totals = extractedData.totals;
  invoice.lineItems = extractedData.lineItems;
  
  // Stage 5: Entity resolution
  invoice.processing.stage = 'resolving_entities';
  await invoice.save();
  
  await resolveOrCreateShop(invoice.shopId);
  const supplierIdStr = await resolveOrCreateSupplier(extractedData.supplierName);
  invoice.supplierId = new mongoose.Types.ObjectId(supplierIdStr);
  
  await resolveOrCreateParts(extractedData.lineItems);
  
  // Stage 6: Context classification
  invoice.processing.stage = 'classifying_context';
  await invoice.save();
  
  const context = await classifyPurchaseContext(
    extractedData.supplierName,
    extractedData.lineItems,
    extractedData.invoiceDate || new Date(),
    extractedData.totals
  );
  invoice.context = context;
  
  // Stage 7: Trend analysis
  invoice.processing.stage = 'analyzing_trends';
  await invoice.save();
  
  const trendAnalysis = await analyzeTrends(invoice.shopId, supplierIdStr, invoice);
  invoice.trendAnalysis = trendAnalysis;
  
  // Stage 8: Generate savings recommendations
  invoice.processing.stage = 'generating_recommendations';
  await invoice.save();
  
  const recommendations = await generateSavingsRecommendations(
    extractedData.supplierName,
    extractedData.lineItems,
    extractedData.totals
  );
  invoice.recommendations = recommendations;
  
  // Stage 9: Persist processed data to S3
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
}

