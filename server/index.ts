import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import sessionRoutes from './routes/sessions';
import userRoutes from './routes/users';
import streamRouter from './routes/stream';
import statsRouter from './routes/stats';
import extractTermsRouter from './routes/extractTerms';
import probeRouter from './routes/probe';

import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
// fallback if running from within /server
if (!process.env.MONGO_URI) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/saiki';
console.log('Final MONGO_URI check:', MONGO_URI.substring(0, 20) + '...');

// Middleware
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// Routes
app.use('/api/saiki/sessions', sessionRoutes);
app.use('/api/saiki/users', userRoutes);
app.use('/api/saiki/stream', streamRouter);
app.use('/api/saiki/stats', statsRouter);
app.use('/api/saiki/extract-terms', extractTermsRouter);
app.use('/api/saiki/probe', probeRouter);

// Database Connection
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
  });

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Saiki Backend running on http://localhost:${PORT}`);
});
