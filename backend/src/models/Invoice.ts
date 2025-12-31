import mongoose, { Schema, Document } from 'mongoose';

export interface ILineItem {
  description: string;
  sku?: string;
  mpn?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence?: number;
}

export interface ITotals {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}

export interface IContext {
  purchaseType: 'routine' | 'rush' | 'specialty';
  constraints: {
    speed?: boolean;
    availability?: boolean;
    relationship?: boolean;
  };
  confidence: number;
  explanation: string;
}

export interface ITrendAnalysis {
  priceChange?: number;
  priceChangePercent?: number;
  volatility?: number;
  anomalies?: string[];
}

export interface ISavingsRange {
  min: number;
  max: number;
}

export interface IRecommendation {
  type: 'alternative_supplier' | 'bulk_order' | 'price_match' | 'other';
  title: string;
  description: string;
  potentialSavings?: number; // Legacy field for backward compatibility
  savingsRange?: ISavingsRange; // Dollar amount range
  savingsPercentRange?: ISavingsRange; // Percentage range (0-100)
  confidence: number;
  evidence: string[];
  actionSteps: string[]; // Specific steps to achieve savings
  estimatedTimeToImplement?: string; // e.g., "1-2 weeks", "immediate"
}

export interface IProcessing {
  stage: string;
  attempts: number;
  lockedAt?: Date;
  lastError?: string;
}

export type InvoiceStatus = 'queued' | 'processing' | 'processed' | 'failed';

export interface IInvoice extends Document {
  shopId: string;
  supplierId?: string;
  status: InvoiceStatus;
  driveFileId?: string;
  driveUrl?: string;
  originalS3Key?: string;
  processedS3Key?: string;
  hashSha256?: string;
  invoiceNumber?: string;
  invoiceDate?: Date;
  totals?: ITotals;
  lineItems: ILineItem[];
  context?: IContext;
  trendAnalysis?: ITrendAnalysis;
  recommendations: IRecommendation[];
  processing: IProcessing;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    shopId: {
      type: String,
      required: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'processed', 'failed'],
      default: 'queued',
      index: true,
    },
    driveFileId: {
      type: String,
    },
    driveUrl: {
      type: String,
    },
    originalS3Key: {
      type: String,
    },
    processedS3Key: {
      type: String,
    },
    hashSha256: {
      type: String,
      index: true,
    },
    invoiceNumber: {
      type: String,
    },
    invoiceDate: {
      type: Date,
    },
    totals: {
      subtotal: Number,
      tax: Number,
      shipping: Number,
      total: Number,
    },
    lineItems: [
      {
        description: String,
        sku: String,
        mpn: String,
        quantity: Number,
        unitPrice: Number,
        total: Number,
        confidence: Number,
      },
    ],
    context: {
      purchaseType: {
        type: String,
        enum: ['routine', 'rush', 'specialty'],
      },
      constraints: {
        speed: Boolean,
        availability: Boolean,
        relationship: Boolean,
      },
      confidence: Number,
      explanation: String,
    },
    trendAnalysis: {
      priceChange: Number,
      priceChangePercent: Number,
      volatility: Number,
      anomalies: [String],
    },
    recommendations: [
      {
        type: {
          type: String,
          enum: ['alternative_supplier', 'bulk_order', 'price_match', 'other'],
        },
        title: String,
        description: String,
        potentialSavings: Number, // Legacy field
        savingsRange: {
          min: Number,
          max: Number,
        },
        savingsPercentRange: {
          min: Number,
          max: Number,
        },
        confidence: Number,
        evidence: [String],
        actionSteps: [String],
        estimatedTimeToImplement: String,
      },
    ],
    processing: {
      stage: {
        type: String,
        default: 'queued',
      },
      attempts: {
        type: Number,
        default: 0,
      },
      lockedAt: Date,
      lastError: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying of queued invoices
InvoiceSchema.index({ status: 1, 'processing.attempts': 1, createdAt: 1 });

export default mongoose.model<IInvoice>('Invoice', InvoiceSchema);

