import express, { Response } from 'express';
import { getPresignedUrl } from '../services/s3';
import Invoice from '../models/Invoice';
import { authenticate, requireShopOwnerOrAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/files/:invoiceId/original-url - Get presigned URL for original invoice
router.get('/:invoiceId/original-url', requireShopOwnerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Shop owners can only access invoices from their shop
    if (req.user?.role === 'shop-owner' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!invoice.originalS3Key) {
      return res.status(404).json({ error: 'Original file not found in S3' });
    }
    
    const url = await getPresignedUrl(invoice.originalS3Key);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

export default router;

