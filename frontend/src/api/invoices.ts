import client from './client';

export interface LineItem {
  description: string;
  sku?: string;
  mpn?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence?: number;
}

export interface Totals {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}

export interface Context {
  purchaseType: 'routine' | 'rush' | 'specialty';
  constraints: {
    speed?: boolean;
    availability?: boolean;
    relationship?: boolean;
  };
  confidence: number;
  explanation: string;
}

export interface TrendAnalysis {
  priceChange?: number;
  priceChangePercent?: number;
  volatility?: number;
  anomalies?: string[];
}

export interface SavingsRange {
  min: number;
  max: number;
}

export interface Recommendation {
  type: 'alternative_supplier' | 'bulk_order' | 'price_match' | 'other';
  title: string;
  description: string;
  potentialSavings?: number; // Legacy field
  savingsRange?: SavingsRange;
  savingsPercentRange?: SavingsRange;
  confidence: number;
  evidence: string[];
  actionSteps: string[];
  estimatedTimeToImplement?: string;
}

export interface RecommendationSummary {
  totalSavingsRange: SavingsRange;
  totalSavingsPercentRange: SavingsRange;
  estimatedTotalSavings: number;
  estimatedTotalSavingsPercent: number;
  combinedActionSteps: string[];
  recommendationCount: number;
}

export type InvoiceStatus = 'queued' | 'processing' | 'processed' | 'failed';

export interface Invoice {
  _id: string;
  shopId: string;
  supplierId?: string;
  status: InvoiceStatus;
  driveFileId?: string;
  driveUrl?: string;
  originalS3Key?: string;
  processedS3Key?: string;
  hashSha256?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  totals?: Totals;
  lineItems: LineItem[];
  context?: Context;
  trendAnalysis?: TrendAnalysis;
  recommendations: Recommendation[];
  processing: {
    stage: string;
    attempts: number;
    lockedAt?: string;
    lastError?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceFilters {
  shopId?: string;
  status?: InvoiceStatus;
}

export const getInvoices = async (filters?: InvoiceFilters): Promise<Invoice[]> => {
  const params = new URLSearchParams();
  if (filters?.shopId) params.append('shopId', filters.shopId);
  if (filters?.status) params.append('status', filters.status);
  
  const response = await client.get(`/invoices?${params.toString()}`);
  return response.data;
};

export const getInvoice = async (invoiceId: string): Promise<Invoice> => {
  const response = await client.get(`/invoices/${invoiceId}`);
  return response.data;
};

export const reprocessInvoice = async (invoiceId: string): Promise<Invoice> => {
  const response = await client.post(`/invoices/${invoiceId}/reprocess`);
  return response.data;
};

export const cancelProcessing = async (invoiceId: string): Promise<Invoice> => {
  const response = await client.post(`/invoices/${invoiceId}/cancel`);
  return response.data;
};

export const getOriginalInvoiceUrl = async (invoiceId: string): Promise<string> => {
  const response = await client.get(`/files/${invoiceId}/original-url`);
  return response.data.url;
};

