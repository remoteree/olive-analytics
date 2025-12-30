import express, { Request, Response } from 'express';
import Shop from '../models/Shop';

const router = express.Router();

// GET /api/shops - List all shops
router.get('/', async (req: Request, res: Response) => {
  try {
    const shops = await Shop.find().sort({ createdAt: -1 });
    res.json(shops);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

// GET /api/shops/:shopId - Get shop by ID
router.get('/:shopId', async (req: Request, res: Response) => {
  try {
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json(shop);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shop' });
  }
});

// POST /api/shops - Create a new shop
router.post('/', async (req: Request, res: Response) => {
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

