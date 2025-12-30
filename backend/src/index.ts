import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import shopRoutes from './routes/shops';
import invoiceRoutes from './routes/invoices';
import fileRoutes from './routes/files';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/shops', shopRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/files', fileRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect to database and start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  });

