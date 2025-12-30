import express, { Request, Response } from 'express';
import Invoice from '../models/Invoice';
import Shop from '../models/Shop';

const router = express.Router();

// GET /api/invoices - List invoices with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { shopId, status } = req.query;
    const query: any = {};
    
    if (shopId) {
      query.shopId = shopId;
    }
    if (status) {
      query.status = status;
    }
    
    const invoices = await Invoice.find(query)
      .populate('supplierId')
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET /api/invoices/:invoiceId - Get invoice by ID
router.get('/:invoiceId', async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId)
      .populate('supplierId');
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// POST /api/invoices/:invoiceId/reprocess - Manually trigger reprocessing
router.post('/:invoiceId/reprocess', async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Reset status to queued for reprocessing
    invoice.status = 'queued';
    invoice.processing.stage = 'queued';
    invoice.processing.attempts = 0;
    invoice.processing.lockedAt = undefined;
    invoice.processing.lastError = undefined;
    
    await invoice.save();
    
    res.json({ message: 'Invoice queued for reprocessing', invoice });
  } catch (error) {
    res.status(500).json({ error: 'Failed to queue invoice for reprocessing' });
  }
});

export default router;

