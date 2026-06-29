import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import mineralsRouter from './routes/minerals';
import searchRouter from './routes/search';
import chatRouter from './routes/chat';
import projectsRouter from './routes/projects';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security ──
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5500',  // Live Server
    /\.vercel\.app$/,          // Vercel deploys
    /\.netlify\.app$/,         // Netlify deploys
  ],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ── Rate limiting ──
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Chat has its own tighter limit (Anthropic costs money)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 20,
  message: { error: 'Chat rate limit reached. Wait a moment.' },
});

app.use('/api', apiLimiter);
app.use('/api/chat', chatLimiter);

// ── Routes ──
app.use('/api/minerals', mineralsRouter);
app.use('/api/search', searchRouter);
app.use('/api/chat', chatRouter);
app.use('/api/projects', projectsRouter);

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ELYSIAN Geo AI API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 ──
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   ELYSIAN Geo AI API — Running        ║
  ║   http://localhost:${PORT}               ║
  ╚═══════════════════════════════════════╝
  `);
});

export default app;
