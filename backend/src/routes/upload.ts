import express, { Response, Request } from 'express';
import multer from 'multer';
import Shop from '../models/Shop';
import Invoice from '../models/Invoice';
import { uploadToS3 } from '../services/s3';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (JPEG, PNG, WebP) and PDFs are allowed.'));
    }
  },
});

// Error handling middleware for multer
const handleMulterError = (err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

// POST /api/upload/:token - Public upload endpoint (no auth required)
router.post('/:token', upload.single('file'), handleMulterError, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Find shop by upload token
    const shop = await Shop.findOne({ uploadToken: token });
    
    if (!shop) {
      return res.status(404).json({ error: 'Invalid upload link' });
    }
    
    // Create invoice record
    const invoice = new Invoice({
      shopId: shop.shopId,
      status: 'queued',
      processing: {
        stage: 'queued',
        attempts: 0,
      },
    });
    
    await invoice.save();
    
    // Upload to S3 under shop name/unprocessed
    const fileExtension = req.file.originalname.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const s3Key = `shops/${shop.shopId}/unprocessed/${invoice._id}_${timestamp}.${fileExtension}`;
    
    await uploadToS3(s3Key, req.file.buffer, req.file.mimetype);
    
    // Update invoice with S3 key
    invoice.originalS3Key = s3Key;
    await invoice.save();
    
    res.status(201).json({
      message: 'Invoice uploaded successfully',
      invoiceId: invoice._id,
      shopName: shop.name,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload invoice' });
  }
});

export default router;
