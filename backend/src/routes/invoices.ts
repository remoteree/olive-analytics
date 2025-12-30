import express, { Response } from 'express';
import Invoice from '../models/Invoice';
import Shop from '../models/Shop';
import { authenticate, requireShopOwnerOrAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/invoices - List invoices with optional filters
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, status } = req.query;
    const query: any = {};
    
    // Shop owners can only see invoices from their shop
    if (req.user?.role === 'shop-owner' && req.user.shopId) {
      query.shopId = req.user.shopId;
    } else if (shopId && req.user?.role === 'admin') {
      // Admins can filter by shopId
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
router.get('/:invoiceId', requireShopOwnerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId)
      .populate('supplierId');
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Shop owners can only access invoices from their shop
    if (req.user?.role === 'shop-owner' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// POST /api/invoices/:invoiceId/reprocess - Manually trigger reprocessing
router.post('/:invoiceId/reprocess', requireShopOwnerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Shop owners can only reprocess invoices from their shop
    if (req.user?.role === 'shop-owner' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
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

