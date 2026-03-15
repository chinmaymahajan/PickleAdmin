/**
 * Backend entry point for Pickleball League Manager
 */
import express from 'express';
import cors from 'cors';
import leagueRoutes from './routes/leagueRoutes';
import playerRoutes from './routes/playerRoutes';
import courtRoutes from './routes/courtRoutes';
import roundRoutes from './routes/roundRoutes';
import devRoutes from './routes/devRoutes';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api', leagueRoutes);
app.use('/api', playerRoutes);
app.use('/api', courtRoutes);
app.use('/api', roundRoutes);
app.use('/api', devRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Only start listening when this file is run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });
}

export default app;
