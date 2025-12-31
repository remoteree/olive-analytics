import { google, Auth } from 'googleapis';
import DriveScan, { IDriveScan, IScannedFile } from '../models/DriveScan';
import Invoice from '../models/Invoice';
import Shop from '../models/Shop';
import { findOrCreateFolder, createGoogleAuth } from './googleDrive';

// Lazy initialization - only create auth/drive when actually used
let _auth: Auth.GoogleAuth | null = null;
let _drive: ReturnType<typeof google.drive> | null = null;

function getAuth() {
  if (!_auth) {
    _auth = createGoogleAuth(['https://www.googleapis.com/auth/drive.readonly']);
  }
  return _auth;
}

function getDrive() {
  if (!_drive) {
    _drive = google.drive({ version: 'v3', auth: getAuth() });
  }
  return _drive;
}

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

    const scannedFiles: IScannedFile[] = [];
    const stats = {
      totalFound: 0,
      newInvoices: 0,
      existingInvoices: 0,
      skipped: 0,
      errors: 0,
    };

    // Step 1: Find or create "Invoices" folder under base folder
    const invoicesFolderId = await findOrCreateFolder(baseFolderId, 'Invoices');

    // Step 2: Discover shop folders dynamically from Drive
    let shopFolders: Array<{ id: string; name: string }> = [];
    
    if (options.shopId) {
      // If specific shop requested, find that folder
      const shopFolder = await findShopFolder(invoicesFolderId, options.shopId);
      if (shopFolder) {
        shopFolders = [shopFolder];
      }
    } else {
      // Discover all shop folders
      shopFolders = await listShopFolders(invoicesFolderId);
    }

    // Step 3: Process each shop folder
    for (const shopFolder of shopFolders) {
      const shopId = shopFolder.name; // Use folder name as shopId
      
      try {
        // Create shop if it doesn't exist
        let shop = await Shop.findOne({ shopId });
        if (!shop) {
          shop = new Shop({
            shopId,
            name: shopId, // Use shopId as name, can be updated later
          });
          await shop.save();
          console.log(`Created new shop: ${shopId}`);
        }

        // Find or create "unprocessed" folder within shop folder
        const unprocessedFolderId = await findOrCreateFolder(shopFolder.id, 'unprocessed');
        
        // List all files in unprocessed folder
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
        console.error(`Error processing shop folder ${shopFolder.name}:`, error);
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

/**
 * List all shop folders (subfolders) within the Invoices folder
 */
async function listShopFolders(parentFolderId: string): Promise<Array<{ id: string; name: string }>> {
  const folders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    try {
      const drive = getDrive();
      const response = await drive.files.list({
        q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'nextPageToken, files(id, name)',
        pageSize: 100,
        pageToken,
      });

      if (response.data.files) {
        folders.push(
          ...response.data.files.map((f) => ({
            id: f.id!,
            name: f.name || 'unknown',
          }))
        );
      }

      pageToken = response.data.nextPageToken || undefined;
    } catch (error) {
      console.error(`Error listing shop folders in ${parentFolderId}:`, error);
      throw error;
    }
  } while (pageToken);

  return folders;
}

/**
 * Find a specific shop folder by name
 */
async function findShopFolder(
  parentFolderId: string,
  shopId: string
): Promise<{ id: string; name: string } | null> {
  try {
    const drive = getDrive();
    const response = await drive.files.list({
      q: `'${parentFolderId}' in parents and name='${shopId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (response.data.files && response.data.files.length > 0) {
      return {
        id: response.data.files[0].id!,
        name: response.data.files[0].name || shopId,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error finding shop folder ${shopId}:`, error);
    throw error;
  }
}

async function listFilesInFolder(folderId: string): Promise<Array<{ id?: string; name?: string; mimeType?: string }>> {
  const files: Array<{ id?: string; name?: string; mimeType?: string }> = [];
  let pageToken: string | undefined;

  do {
    try {
      const drive = getDrive();
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 100,
        pageToken,
      });

      if (response.data.files) {
        // Map Schema$File to our expected type, filtering out null ids
        const mappedFiles = response.data.files
          .filter((file): file is { id: string; name?: string | null; mimeType?: string | null } => file.id !== null && file.id !== undefined)
          .map((file) => ({
            id: file.id!,
            name: file.name || undefined,
            mimeType: file.mimeType || undefined,
          }));
        files.push(...mappedFiles);
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

