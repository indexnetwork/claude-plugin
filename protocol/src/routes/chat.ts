import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { StreamChat } from 'stream-chat';
import { authenticatePrivy, AuthRequest } from '../middleware/auth';

const router = Router();

const STREAM_API_KEY = process.env.STREAM_API_KEY || '6238du93us6h';
const STREAM_SECRET = process.env.STREAM_SECRET || 't3mw3chjktp9p5pu2cwfahusz3ndjzfumnaap488cap2kg7nff7a48kt8qtqcrn6';

// Generate Stream Chat token
router.post('/token',
  authenticatePrivy,
  [body('userId').isUUID()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { userId } = req.body;

      // Verify user can only generate token for themselves
      if (req.user!.id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const serverClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_SECRET);
      const token = serverClient.createToken(userId);

      return res.json({ token });
    } catch (error) {
      console.error('Error generating Stream token:', error);
      return res.status(500).json({ error: 'Failed to generate token' });
    }
  }
);

// Upsert user in Stream Chat
router.post('/user',
  authenticatePrivy,
  [
    body('userId').isUUID(),
    body('userName').trim().isLength({ min: 1, max: 255 }),
    body('userAvatar').optional().isURL(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { userId, userName, userAvatar } = req.body;

      const serverClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_SECRET);

      await serverClient.upsertUser({
        id: userId,
        name: userName,
        image: userAvatar || `https://api.dicebear.com/9.x/shapes/png?seed=${userId}`,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('Error upserting Stream user:', error);
      return res.status(500).json({ error: 'Failed to upsert user' });
    }
  }
);

export default router;

