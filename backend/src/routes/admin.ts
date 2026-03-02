import express, { Response } from 'express';
import crypto from 'crypto';
import User from '../models/User';
import Shop from '../models/Shop';
import DriveScan from '../models/DriveScan';
import Invoice from '../models/Invoice';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { scanDriveForInvoices, getScanStatus } from '../services/driveScanner';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// GET /api/admin/users - List all users
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find()
      .select('-password -passwordResetToken')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/shops - List all shops (same as shops route but explicit admin endpoint)
router.get('/shops', async (req: AuthRequest, res: Response) => {
  try {
    const shops = await Shop.find().sort({ createdAt: -1 });
    res.json(shops);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

// POST /api/admin/scan-drive - Trigger Google Drive scan
router.post('/scan-drive', async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, baseFolderId } = req.body;
    
    // Create scan record
    const scan = new DriveScan({
      initiatedBy: req.user!.id,
      status: 'pending',
      shopId,
      baseFolderId,
    });
    
    await scan.save();
    
    // Start scan asynchronously (don't wait for completion)
    scanDriveForInvoices(scan._id.toString(), req.user!.id, { shopId, baseFolderId })
      .catch((error) => {
        console.error('Scan error:', error);
      });
    
    res.status(202).json({
      message: 'Scan started',
      scanId: scan._id,
      status: scan.status,
    });
  } catch (error: any) {
    console.error('Error starting scan:', error);
    res.status(500).json({ error: error.message || 'Failed to start scan' });
  }
});

// GET /api/admin/scans - List all scans
router.get('/scans', async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    const scans = await DriveScan.find()
      .populate('initiatedBy', 'email')
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    
    res.json(scans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch scans' });
  }
});

// GET /api/admin/scans/:scanId - Get scan details
router.get('/scans/:scanId', async (req: AuthRequest, res: Response) => {
  try {
    const scan = await DriveScan.findById(req.params.scanId)
      .populate('initiatedBy', 'email');
    
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    res.json(scan);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch scan' });
  }
});

// POST /api/admin/unlock-stuck-invoices - Manually unlock stuck invoices
router.post('/unlock-stuck-invoices', async (req: AuthRequest, res: Response) => {
  try {
    const { timeoutMinutes = 30 } = req.body;
    const timeoutThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    
    const stuckInvoices = await Invoice.find({
      status: 'processing',
      'processing.lockedAt': { $lt: timeoutThreshold },
    });
    
    if (stuckInvoices.length === 0) {
      return res.json({ 
        message: 'No stuck invoices found',
        unlocked: 0 
      });
    }
    
    const unlockedIds: string[] = [];
    
    for (const invoice of stuckInvoices) {
      const lockedDuration = Math.round((Date.now() - (invoice.processing.lockedAt?.getTime() || 0)) / 1000 / 60);
      
      invoice.status = 'queued';
      invoice.processing.stage = 'queued';
      invoice.processing.lockedAt = undefined;
      invoice.processing.lastError = `Manually unlocked after being stuck for ${lockedDuration} minutes (stage: ${invoice.processing.stage})`;
      
      await invoice.save();
      unlockedIds.push(invoice._id.toString());
    }
    
    res.json({
      message: `Unlocked ${stuckInvoices.length} stuck invoice(s)`,
      unlocked: stuckInvoices.length,
      invoiceIds: unlockedIds,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to unlock stuck invoices' });
  }
});

// POST /api/admin/shops/onboard - Onboard a new shop
router.post('/shops/onboard', async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, name, cohort, storageType } = req.body;
    
    if (!shopId || !name) {
      return res.status(400).json({ error: 'shopId and name are required' });
    }
    
    // Generate upload token
    const uploadToken = crypto.randomBytes(32).toString('hex');
    
    const shop = new Shop({
      shopId,
      name,
      cohort,
      storageType: storageType || 'google-drive',
      uploadToken,
    });
    
    await shop.save();
    
    // Generate upload URL (frontend route, not API route)
    // In development, frontend runs on port 3000, backend on 3001
    // In production, they're on the same domain and use HTTPS
    let frontendBaseUrl = process.env.FRONTEND_URL;
    if (!frontendBaseUrl) {
      const host = req.get('host') || 'localhost:3001';
      const isProduction = process.env.NODE_ENV === 'production';
      const protocol = isProduction ? 'https' : req.protocol;
      
      if (host.includes('localhost:3001') || host.includes('127.0.0.1:3001')) {
        // Development: use frontend port
        frontendBaseUrl = `${req.protocol}://localhost:3000`;
      } else {
        // Production: same domain with HTTPS
        frontendBaseUrl = `${protocol}://${host}`;
      }
    }
    const uploadUrl = `${frontendBaseUrl}/upload/${uploadToken}`;
    
    res.status(201).json({
      shop,
      uploadUrl,
      uploadToken,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Shop ID or upload token already exists' });
    }
    console.error('Error onboarding shop:', error);
    res.status(500).json({ error: error.message || 'Failed to onboard shop' });
  }
});

// PUT /api/admin/shops/:shopId/storage-type - Update shop storage type
router.put('/shops/:shopId/storage-type', async (req: AuthRequest, res: Response) => {
  try {
    const { storageType } = req.body;
    
    if (!['google-drive', 'olive'].includes(storageType)) {
      return res.status(400).json({ error: 'Invalid storage type. Must be "google-drive" or "olive"' });
    }
    
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    
    shop.storageType = storageType as 'google-drive' | 'olive';
    await shop.save();
    
    res.json(shop);
  } catch (error: any) {
    console.error('Error updating storage type:', error);
    res.status(500).json({ error: error.message || 'Failed to update storage type' });
  }
});

// GET /api/admin/shops/:shopId/upload-link - Get upload link for shop
router.get('/shops/:shopId/upload-link', async (req: AuthRequest, res: Response) => {
  try {
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    
    if (!shop.uploadToken) {
      // Generate token if doesn't exist
      shop.uploadToken = crypto.randomBytes(32).toString('hex');
      await shop.save();
    }
    
    // Generate upload URL (frontend route, not API route)
    // In development, frontend runs on port 3000, backend on 3001
    // In production, they're on the same domain and use HTTPS
    let frontendBaseUrl = process.env.FRONTEND_URL;
    if (!frontendBaseUrl) {
      const host = req.get('host') || 'localhost:3001';
      const isProduction = process.env.NODE_ENV === 'production';
      const protocol = isProduction ? 'https' : req.protocol;
      
      if (host.includes('localhost:3001') || host.includes('127.0.0.1:3001')) {
        // Development: use frontend port
        frontendBaseUrl = `${req.protocol}://localhost:3000`;
      } else {
        // Production: same domain with HTTPS
        frontendBaseUrl = `${protocol}://${host}`;
      }
    }
    const uploadUrl = `${frontendBaseUrl}/upload/${shop.uploadToken}`;
    
    res.json({ uploadUrl, uploadToken: shop.uploadToken });
  } catch (error: any) {
    console.error('Error getting upload link:', error);
    res.status(500).json({ error: error.message || 'Failed to get upload link' });
  }
});

export default router;

