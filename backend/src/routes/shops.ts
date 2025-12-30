import express, { Response } from 'express';
import Shop from '../models/Shop';
import { authenticate, authorize, AuthRequest, requireShopOwnerOrAdmin } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/shops - List shops (admin sees all, shop-owner sees only their shop)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let query: any = {};
    
    // Shop owners can only see their own shop
    if (req.user?.role === 'shop-owner' && req.user.shopId) {
      query.shopId = req.user.shopId;
    }
    // Admins see all shops
    
    const shops = await Shop.find(query).sort({ createdAt: -1 });
    res.json(shops);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

// GET /api/shops/:shopId - Get shop by ID
router.get('/:shopId', requireShopOwnerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    
    // Shop owners can only access their own shop
    if (req.user?.role === 'shop-owner' && shop.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(shop);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shop' });
  }
});

// POST /api/shops - Create a new shop (admin only)
router.post('/', authorize('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, name, cohort } = req.body;
    const shop = new Shop({ shopId, name, cohort });
    await shop.save();
    res.status(201).json(shop);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Shop ID already exists' });
    }
    res.status(500).json({ error: 'Failed to create shop' });
  }
});

export default router;

