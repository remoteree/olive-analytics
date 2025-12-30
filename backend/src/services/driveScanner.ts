import { google } from 'googleapis';
import DriveScan, { IDriveScan, IScannedFile } from '../models/DriveScan';
import Invoice from '../models/Invoice';
import Shop from '../models/Shop';
import { getFolderId } from './googleDrive';

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });

// Supported invoice file types
const INVOICE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

export interface ScanOptions {
  shopId?: string;
  baseFolderId?: string;
}

export async function scanDriveForInvoices(
  scanId: string,
  userId: string,
  options: ScanOptions = {}
): Promise<void> {
  const scan = await DriveScan.findById(scanId);
  if (!scan) {
    throw new Error('Scan not found');
  }

  try {
    scan.status = 'running';
    scan.startedAt = new Date();
    await scan.save();

    const baseFolderId = options.baseFolderId || process.env.GOOGLE_DRIVE_BASE_FOLDER_ID;
    if (!baseFolderId) {
      throw new Error('GOOGLE_DRIVE_BASE_FOLDER_ID not configured');
    }

    // Get all shops to scan
    let shops: Array<{ shopId: string }> = [];
    if (options.shopId) {
      shops = [{ shopId: options.shopId }];
    } else {
      const shopDocs = await Shop.find().select('shopId');
      shops = shopDocs.map((s) => ({ shopId: s.shopId }));
    }

    const scannedFiles: IScannedFile[] = [];
    const stats = {
      totalFound: 0,
      newInvoices: 0,
      existingInvoices: 0,
      skipped: 0,
      errors: 0,
    };

    // Scan each shop's unprocessed folder
    for (const shop of shops) {
      try {
        const unprocessedFolderId = await getFolderId(shop.shopId, 'unprocessed');
        const files = await listFilesInFolder(unprocessedFolderId);

        for (const file of files) {
          stats.totalFound++;

          // Check if file is a supported invoice type
          if (!INVOICE_MIME_TYPES.includes(file.mimeType || '')) {
            scannedFiles.push({
              fileId: file.id!,
              fileName: file.name || 'unknown',
              shopId: shop.shopId,
              folderPath: `Invoices/${shop.shopId}/unprocessed`,
              mimeType: file.mimeType || 'unknown',
              status: 'skipped',
              error: 'Unsupported file type',
            });
            stats.skipped++;
            continue;
          }

          // Check if invoice already exists for this file
          const existingInvoice = await Invoice.findOne({ driveFileId: file.id });
          if (existingInvoice) {
            scannedFiles.push({
              fileId: file.id!,
              fileName: file.name || 'unknown',
              shopId: shop.shopId,
              folderPath: `Invoices/${shop.shopId}/unprocessed`,
              mimeType: file.mimeType || 'unknown',
              invoiceId: existingInvoice._id,
              status: 'existing',
            });
            stats.existingInvoices++;
            continue;
          }

          // Create new invoice record
          try {
            const invoice = new Invoice({
              shopId: shop.shopId,
              status: 'queued',
              driveFileId: file.id,
              driveUrl: `https://drive.google.com/file/d/${file.id}`,
              processing: {
                stage: 'queued',
                attempts: 0,
              },
            });

            await invoice.save();

            scannedFiles.push({
              fileId: file.id!,
              fileName: file.name || 'unknown',
              shopId: shop.shopId,
              folderPath: `Invoices/${shop.shopId}/unprocessed`,
              mimeType: file.mimeType || 'unknown',
              invoiceId: invoice._id,
              status: 'new',
            });
            stats.newInvoices++;
          } catch (error: any) {
            scannedFiles.push({
              fileId: file.id!,
              fileName: file.name || 'unknown',
              shopId: shop.shopId,
              folderPath: `Invoices/${shop.shopId}/unprocessed`,
              mimeType: file.mimeType || 'unknown',
              status: 'error',
              error: error.message || 'Failed to create invoice',
            });
            stats.errors++;
          }
        }
      } catch (error: any) {
        console.error(`Error scanning shop ${shop.shopId}:`, error);
        stats.errors++;
      }
    }

    // Update scan with results
    scan.scannedFiles = scannedFiles;
    scan.stats = stats;
    scan.status = 'completed';
    scan.completedAt = new Date();
    await scan.save();

    console.log(`Scan ${scanId} completed: ${stats.newInvoices} new invoices created`);
  } catch (error: any) {
    scan.status = 'failed';
    scan.error = error.message || String(error);
    scan.completedAt = new Date();
    await scan.save();
    throw error;
  }
}

async function listFilesInFolder(folderId: string): Promise<Array<{ id?: string; name?: string; mimeType?: string }>> {
  const files: Array<{ id?: string; name?: string; mimeType?: string }> = [];
  let pageToken: string | undefined;

  do {
    try {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 100,
        pageToken,
      });

      if (response.data.files) {
        files.push(...response.data.files);
      }

      pageToken = response.data.nextPageToken || undefined;
    } catch (error) {
      console.error(`Error listing files in folder ${folderId}:`, error);
      throw error;
    }
  } while (pageToken);

  return files;
}

export async function getScanStatus(scanId: string): Promise<IDriveScan | null> {
  return await DriveScan.findById(scanId).populate('initiatedBy', 'email');
}

