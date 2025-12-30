import express, { Request, Response } from 'express';
import { getPresignedUrl } from '../services/s3';
import Invoice from '../models/Invoice';

const router = express.Router();

// GET /api/files/:invoiceId/original-url - Get presigned URL for original invoice
router.get('/:invoiceId/original-url', async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
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

