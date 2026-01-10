import express, { Request, Response } from 'express';
import User from '../models/User';
import Shop from '../models/Shop';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth';
import { sendTemporaryCredentials, sendPasswordResetEmail } from '../services/email';
import crypto from 'crypto';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user._id.toString(), user.email, user.role, user.shopId);
    
    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        shopId: user.shopId,
        isTemporaryPassword: user.isTemporaryPassword,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/signup (admin only)
router.post('/signup', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Only admins can create accounts
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create accounts' });
    }
    
    const { email, role, shopId } = req.body;
    
    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }
    
    if (role === 'shop-owner' && !shopId) {
      return res.status(400).json({ error: 'shopId is required for shop-owner role' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(8).toString('hex');
    
    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password: temporaryPassword,
      role,
      shopId: role === 'shop-owner' ? shopId : undefined,
      isTemporaryPassword: true,
    });
    
    await user.save();
    
    // Link shop to user if shop-owner
    if (role === 'shop-owner' && shopId) {
      await Shop.findOneAndUpdate(
        { shopId },
        { ownerId: user._id }
      );
    }
    
    // Send temporary credentials via email
    try {
      await sendTemporaryCredentials(email, temporaryPassword);
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Don't fail the request if email fails, but log it
    }
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        shopId: user.shopId,
      },
      temporaryPassword, // Return in response for admin (email may fail)
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    
    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    user.password = newPassword;
    user.isTemporaryPassword = false;
    await user.save();
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists for security
      return res.json({ message: 'If the email exists, a password reset link has been sent' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();
    
    // Send reset email
    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
      return res.status(500).json({ error: 'Failed to send reset email' });
    }
    
    res.json({ message: 'If the email exists, a password reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.isTemporaryPassword = false;
    await user.save();
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      shopId: user.shopId,
      isTemporaryPassword: user.isTemporaryPassword,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;



