// OCR service - placeholder for actual OCR implementation
// In production, integrate with services like AWS Textract, Google Cloud Vision, or Tesseract

export interface ExtractedInvoiceData {
  supplierName: string;
  invoiceNumber?: string;
  invoiceDate?: Date;
  lineItems: Array<{
    description: string;
    sku?: string;
    mpn?: string;
    quantity: number;
    unitPrice: number;
    total: number;
    confidence?: number;
  }>;
  totals: {
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
  };
}

export async function extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<ExtractedInvoiceData> {
  // TODO: Integrate with actual OCR service
  // For MVP, this is a placeholder that returns mock data
  
  // In production, you would:
  // 1. Use AWS Textract for PDFs/images
  // 2. Use Google Cloud Vision API
  // 3. Or use Tesseract.js for simpler cases
  
  console.warn('OCR extraction not implemented - returning mock data');
  
  // Mock extracted data structure
  return {
    supplierName: 'Unknown Supplier',
    invoiceNumber: 'INV-001',
    invoiceDate: new Date(),
    lineItems: [
      {
        description: 'Brake Pad Set',
        sku: 'BP-12345',
        quantity: 2,
        unitPrice: 45.99,
        total: 91.98,
        confidence: 0.85,
      },
    ],
    totals: {
      subtotal: 91.98,
      tax: 7.36,
      shipping: 10.00,
      total: 109.34,
    },
  };
}



