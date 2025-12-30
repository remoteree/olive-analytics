import mongoose from 'mongoose';
import Invoice, { IInvoice } from '../models/Invoice';

export interface TrendAnalysisResult {
  priceChange?: number;
  priceChangePercent?: number;
  volatility?: number;
  anomalies?: string[];
}

export async function analyzeTrends(
  shopId: string,
  supplierId: string | mongoose.Types.ObjectId,
  currentInvoice: IInvoice
): Promise<TrendAnalysisResult> {
  try {
    // Convert supplierId to ObjectId if it's a string
    const supplierObjectId = typeof supplierId === 'string' 
      ? new mongoose.Types.ObjectId(supplierId)
      : supplierId;
    
    // Find historical invoices from the same supplier
    const historicalInvoices = await Invoice.find({
      shopId,
      supplierId: supplierObjectId,
      status: 'processed',
      _id: { $ne: currentInvoice._id },
    })
      .sort({ invoiceDate: -1 })
      .limit(10);

    if (historicalInvoices.length === 0) {
      return {
        anomalies: ['No historical data available for comparison'],
      };
    }

    const currentTotal = currentInvoice.totals?.total || 0;
    const historicalTotals = historicalInvoices
      .map((inv) => inv.totals?.total || 0)
      .filter((total) => total > 0);

    if (historicalTotals.length === 0) {
      return {
        anomalies: ['Historical invoices missing total amounts'],
      };
    }

    // Calculate average historical total
    const avgHistorical = historicalTotals.reduce((a, b) => a + b, 0) / historicalTotals.length;
    
    // Calculate price change
    const priceChange = currentTotal - avgHistorical;
    const priceChangePercent = avgHistorical > 0 ? (priceChange / avgHistorical) * 100 : 0;

    // Calculate volatility (standard deviation)
    const variance = historicalTotals.reduce((acc, total) => {
      const diff = total - avgHistorical;
      return acc + diff * diff;
    }, 0) / historicalTotals.length;
    const volatility = Math.sqrt(variance);

    // Detect anomalies
    const anomalies: string[] = [];
    const threshold = avgHistorical * 0.2; // 20% threshold
    
    if (Math.abs(priceChange) > threshold) {
      if (priceChange > 0) {
        anomalies.push(`Price increased by ${priceChangePercent.toFixed(1)}% compared to average`);
      } else {
        anomalies.push(`Price decreased by ${Math.abs(priceChangePercent).toFixed(1)}% compared to average`);
      }
    }

    // Check for unusual line item patterns
    if (currentInvoice.lineItems.length === 0) {
      anomalies.push('Invoice has no line items');
    }

    return {
      priceChange,
      priceChangePercent,
      volatility,
      anomalies: anomalies.length > 0 ? anomalies : undefined,
    };
  } catch (error) {
    console.error('Error analyzing trends:', error);
    return {
      anomalies: ['Error analyzing trends'],
    };
  }
}

