import client from './client';

export interface ScannedFile {
  fileId: string;
  fileName: string;
  shopId: string;
  folderPath: string;
  mimeType: string;
  invoiceId?: string;
  status: 'new' | 'existing' | 'skipped' | 'error';
  error?: string;
}

export interface ScanStats {
  totalFound: number;
  newInvoices: number;
  existingInvoices: number;
  skipped: number;
  errors: number;
}

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface DriveScan {
  _id: string;
  initiatedBy: {
    _id: string;
    email: string;
  };
  status: ScanStatus;
  shopId?: string;
  baseFolderId?: string;
  scannedFiles: ScannedFile[];
  stats: ScanStats;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScanOptions {
  shopId?: string;
  baseFolderId?: string;
}

export const startScan = async (options?: ScanOptions): Promise<{ scanId: string; status: string }> => {
  const response = await client.post('/admin/scan-drive', options || {});
  return response.data;
};

export const getScans = async (limit?: number): Promise<DriveScan[]> => {
  const params = limit ? `?limit=${limit}` : '';
  const response = await client.get(`/admin/scans${params}`);
  return response.data;
};

export const getScan = async (scanId: string): Promise<DriveScan> => {
  const response = await client.get(`/admin/scans/${scanId}`);
  return response.data;
};



