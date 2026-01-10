import mongoose, { Schema, Document } from 'mongoose';

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IScannedFile {
  fileId: string;
  fileName: string;
  shopId: string;
  folderPath: string;
  mimeType: string;
  invoiceId?: mongoose.Types.ObjectId; // Reference to created Invoice
  status: 'new' | 'existing' | 'skipped' | 'error';
  error?: string;
}

export interface IDriveScan extends Document {
  initiatedBy: mongoose.Types.ObjectId; // Reference to User (admin)
  status: ScanStatus;
  shopId?: string; // If scanning specific shop, otherwise scans all shops
  baseFolderId?: string; // Google Drive base folder ID
  scannedFiles: IScannedFile[];
  stats: {
    totalFound: number;
    newInvoices: number;
    existingInvoices: number;
    skipped: number;
    errors: number;
  };
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ScannedFileSchema = new Schema<IScannedFile>({
  fileId: {
    type: String,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  shopId: {
    type: String,
    required: true,
  },
  folderPath: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  invoiceId: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
  },
  status: {
    type: String,
    enum: ['new', 'existing', 'skipped', 'error'],
    required: true,
  },
  error: String,
});

const DriveScanSchema = new Schema<IDriveScan>(
  {
    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    shopId: {
      type: String,
      index: true,
    },
    baseFolderId: {
      type: String,
    },
    scannedFiles: [ScannedFileSchema],
    stats: {
      totalFound: {
        type: Number,
        default: 0,
      },
      newInvoices: {
        type: Number,
        default: 0,
      },
      existingInvoices: {
        type: Number,
        default: 0,
      },
      skipped: {
        type: Number,
        default: 0,
      },
      errors: {
        type: Number,
        default: 0,
      },
    },
    startedAt: Date,
    completedAt: Date,
    error: String,
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
DriveScanSchema.index({ status: 1, createdAt: -1 });
DriveScanSchema.index({ initiatedBy: 1, createdAt: -1 });

export default mongoose.model<IDriveScan>('DriveScan', DriveScanSchema);



