import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { contentLimiter, userContentLimiter } from '../middleware/rateLimit.js';
import { createFeedback } from '../db/feedback.js';

const router = Router();

const VALID_TYPES = ['show_request', 'bug_report'];
const MAX_CONTENT_LENGTH = 1000;

// ── POST /api/feedback ────────────────────────────────────────────────────────
// Authenticated users only. Submits a show request or bug report.

router.post('/', contentLimiter, authenticateToken, userContentLimiter, async (req, res) => {
  const { type, content } = req.body;

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'type must be show_request or bug_report.' });
  }
  if (typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'content must be a non-empty string.' });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ error: `content must be ${MAX_CONTENT_LENGTH} characters or fewer.` });
  }

  try {
    const feedback = await createFeedback({
      userId: req.user.id,
      type,
      content: content.trim(),
    });
    res.status(201).json(feedback);
  } catch (err) {
    console.error('[POST /api/feedback]', err);
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

export default router;
