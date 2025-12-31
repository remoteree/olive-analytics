import { google, Auth } from 'googleapis';
import { Readable } from 'stream';

/**
 * Creates Google Auth instance supporting both JSON string and file path
 * If GOOGLE_APPLICATION_CREDENTIALS starts with '{', it's treated as JSON
 * Otherwise, it's treated as a file path (backward compatibility)
 */
export function createGoogleAuth(scopes: string[] = ['https://www.googleapis.com/auth/drive']): Auth.GoogleAuth {
  const credentialsEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  if (!credentialsEnv) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set');
  }

  // Check if it's JSON (starts with {) or a file path
  if (credentialsEnv.trim().startsWith('{')) {
    try {
      // Parse JSON credentials from environment variable
      const credentials = JSON.parse(credentialsEnv);
      return new Auth.GoogleAuth({
        credentials,
        scopes,
      });
    } catch (error) {
      throw new Error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS as JSON. Ensure it contains valid JSON.');
    }
  } else {
    // Use as file path (backward compatibility)
    return new Auth.GoogleAuth({
      keyFile: credentialsEnv,
      scopes,
    });
  }
}

// Lazy initialization - only create auth/drive when actually used
let _auth: Auth.GoogleAuth | null = null;
let _drive: ReturnType<typeof google.drive> | null = null;

function getAuth() {
  if (!_auth) {
    _auth = createGoogleAuth();
  }
  return _auth;
}

function getDrive() {
  if (!_drive) {
    _drive = google.drive({ version: 'v3', auth: getAuth() });
  }
  return _drive;
}

const DRIVE_BASE_FOLDER = process.env.GOOGLE_DRIVE_BASE_FOLDER_ID || '';

export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  try {
    const drive = getDrive();
    const fileMetadata = await drive.files.get({
      fileId,
      fields: 'name, mimeType',
    });
    
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    
    const buffer = Buffer.from(response.data as ArrayBuffer);
    
    return {
      buffer,
      mimeType: fileMetadata.data.mimeType || 'application/octet-stream',
      name: fileMetadata.data.name || 'unknown',
    };
  } catch (error) {
    console.error('Error downloading file from Google Drive:', error);
    throw error;
  }
}

export async function moveFile(
  fileId: string,
  targetFolderId: string,
  removeFromParents?: string
): Promise<void> {
  try {
    const drive = getDrive();
    // If removeFromParents not provided, get current parents
    let parentsToRemove = removeFromParents;
    if (!parentsToRemove) {
      const file = await drive.files.get({
        fileId,
        fields: 'parents',
      });
      if (file.data.parents && file.data.parents.length > 0) {
        parentsToRemove = file.data.parents.join(',');
      }
    }
    
    await drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: parentsToRemove,
      fields: 'id, parents',
    });
  } catch (error) {
    console.error('Error moving file in Google Drive:', error);
    throw error;
  }
}

export async function getFolderId(shopId: string, folderType: 'unprocessed' | 'processed' | 'failed'): Promise<string> {
  // In a real implementation, you'd query Drive API to find/create folders
  // For MVP, we'll use environment variables or query Drive API
  
  // Option 1: Use environment variable if configured
  const envKey = `GOOGLE_DRIVE_${shopId.toUpperCase()}_${folderType.toUpperCase()}_FOLDER_ID`;
  const envFolderId = process.env[envKey];
  if (envFolderId) {
    return envFolderId;
  }
  
  // Option 2: Try to find/create folder structure
  // Base folder ID from environment
  const baseFolderId = process.env.GOOGLE_DRIVE_BASE_FOLDER_ID;
  if (!baseFolderId) {
    throw new Error(`GOOGLE_DRIVE_BASE_FOLDER_ID not configured. Set ${envKey} or configure base folder.`);
  }
  
  try {
    // Find or create Invoices folder
    const invoicesFolderId = await findOrCreateFolder(baseFolderId, 'Invoices');
    
    // Find or create shop folder
    const shopFolderId = await findOrCreateFolder(invoicesFolderId, shopId);
    
    // Find or create type folder
    const typeFolderId = await findOrCreateFolder(shopFolderId, folderType);
    
    return typeFolderId;
  } catch (error) {
    console.error(`Error resolving folder for ${shopId}/${folderType}:`, error);
    throw new Error(`Failed to resolve folder. Set ${envKey} environment variable or configure folder structure.`);
  }
}

export async function findOrCreateFolder(parentId: string, folderName: string): Promise<string> {
  try {
    const drive = getDrive();
    // Search for existing folder
    const response = await drive.files.list({
      q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 1,
    });
    
    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }
    
    // Create folder if not found
    const folder = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });
    
    return folder.data.id!;
  } catch (error) {
    console.error(`Error finding/creating folder ${folderName}:`, error);
    throw error;
  }
}

export function getFileExtension(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
  };
  
  return mimeMap[mimeType] || 'bin';
}

