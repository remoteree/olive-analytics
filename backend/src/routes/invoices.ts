import express, { Response } from 'express';
import Invoice from '../models/Invoice';
import Shop from '../models/Shop';
import Supplier from '../models/Supplier';
import { authenticate, requireShopOwnerOrAdmin, AuthRequest } from '../middleware/auth';
import { getFolderId, moveFile } from '../services/googleDrive';

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
      .populate({
        path: 'supplierId',
        select: 'normalizedName aliases contactInfo',
        options: { strictPopulate: false }
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    
    res.json(invoices);
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ 
      error: 'Failed to fetch invoices',
      message: error.message || 'Unknown error'
    });
  }
});

// GET /api/invoices/:invoiceId - Get invoice by ID
router.get('/:invoiceId', requireShopOwnerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId)
      .populate({
        path: 'supplierId',
        select: 'normalizedName aliases contactInfo',
        options: { strictPopulate: false }
      })
      .lean();
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Shop owners can only access invoices from their shop
    if (req.user?.role === 'shop-owner' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(invoice);
  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ 
      error: 'Failed to fetch invoice',
      message: error.message || 'Unknown error'
    });
  }
});

// POST /api/invoices/:invoiceId/cancel - Cancel processing and requeue
router.post('/:invoiceId/cancel', requireShopOwnerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Shop owners can only cancel invoices from their shop
    if (req.user?.role === 'shop-owner' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Only cancel if currently processing
    if (invoice.status !== 'processing') {
      return res.status(400).json({ 
        error: `Invoice is not currently processing. Current status: ${invoice.status}` 
      });
    }
    
    // Move file back to unprocessed folder if it exists
    try {
      if (invoice.driveFileId) {
        const unprocessedFolderId = await getFolderId(invoice.shopId, 'unprocessed');
        await moveFile(invoice.driveFileId, unprocessedFolderId);
        console.log(`Moved invoice ${invoice._id} file back to unprocessed folder`);
      }
    } catch (error) {
      console.error('Failed to move file back to unprocessed folder:', error);
      // Continue even if file move fails
    }
    
    // Reset to queued
    invoice.status = 'queued';
    invoice.processing.stage = 'queued';
    invoice.processing.attempts = 0;
    invoice.processing.lockedAt = undefined;
    invoice.processing.lastError = 'Processing cancelled by user';
    
    await invoice.save();
    
    res.json({ 
      message: 'Invoice processing cancelled and requeued',
      invoice 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to cancel invoice processing' });
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
    
    // Move file back to unprocessed folder if it's in processed or failed folder
    try {
      if (invoice.driveFileId && (invoice.status === 'processed' || invoice.status === 'failed')) {
        const unprocessedFolderId = await getFolderId(invoice.shopId, 'unprocessed');
        await moveFile(invoice.driveFileId, unprocessedFolderId);
        console.log(`Moved invoice ${invoice._id} file back to unprocessed folder for reprocessing`);
      }
    } catch (error) {
      console.error('Failed to move file back to unprocessed folder:', error);
      // Continue even if file move fails
    }
    
    // Reset status to queued for reprocessing
    invoice.status = 'queued';
    invoice.processing.stage = 'queued';
    invoice.processing.attempts = 0;
    invoice.processing.lockedAt = undefined;
    invoice.processing.lastError = undefined;
    
    await invoice.save();
    
    res.json({ message: 'Invoice queued for reprocessing', invoice });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to queue invoice for reprocessing' });
  }
});

export default router;

