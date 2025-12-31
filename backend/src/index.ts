import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './config/database';
// Import all models to ensure they're registered with Mongoose
import './models/User';
import './models/Shop';
import './models/Supplier';
import './models/Invoice';
import './models/Part';
import './models/DriveScan';
import authRoutes from './routes/auth';
import shopRoutes from './routes/shops';
import invoiceRoutes from './routes/invoices';
import fileRoutes from './routes/files';
import adminRoutes from './routes/admin';

dotenv.config();

const app = express();
// Elastic Beanstalk sets PORT environment variable automatically, default to 3001 for local dev
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/shops', shopRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from frontend build (for production)
const frontendBuildPath = path.join(__dirname, '../frontend-dist');
if (process.env.NODE_ENV === 'production') {
  // Serve static files (CSS, JS, images, etc.)
  app.use(express.static(frontendBuildPath));
  
  // Serve frontend for all non-API routes (SPA fallback)
  // This must be last, after all API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

// Start server first, then connect to database
// This ensures the app responds even if DB connection fails initially
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`Frontend path: ${frontendBuildPath}`);
  
  // Connect to database (non-blocking)
  connectDB()
    .then(() => {
      console.log('Database connected successfully');
    })
    .catch((error) => {
      console.error('Failed to connect to database:', error);
      console.error('Application will continue running but database operations will fail');
      // Don't exit - allow app to start and show errors in UI
    });
});

