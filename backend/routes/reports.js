import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { contentLimiter } from '../middleware/rateLimit.js';
import { createReport } from '../db/reports.js';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_TARGET_TYPES = ['review', 'comment', 'user'];

// ── POST /api/reports ─────────────────────────────────────────────────────────
// Authenticated users only. Files a report against a piece of content.

router.post('/', contentLimiter, authenticateToken, async (req, res) => {
  const { targetType, targetId, reportedUserId } = req.body;

  if (!VALID_TARGET_TYPES.includes(targetType)) {
    return res.status(400).json({ error: 'targetType must be review, comment, or user.' });
  }
  if (!UUID_REGEX.test(targetId)) {
    return res.status(400).json({ error: 'targetId must be a valid UUID.' });
  }
  if (!UUID_REGEX.test(reportedUserId)) {
    return res.status(400).json({ error: 'reportedUserId must be a valid UUID.' });
  }
  if (req.user.id === reportedUserId) {
    return res.status(400).json({ error: 'You cannot report yourself.' });
  }

  try {
    const report = await createReport(req.user.id, targetType, targetId, reportedUserId);
    res.status(201).json(report);
  } catch (err) {
    console.error('[POST /api/reports]', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

export default router;