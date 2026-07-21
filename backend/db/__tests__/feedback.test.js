import { describe, it, expect, afterEach } from 'vitest';
import { createFeedback, resolveFeedback } from '../feedback.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'fb_cr';

async function makeUser(suffix = '') {
  const uid = `${Date.now() % 1000000}_${++_seq}`;
  return createUser({
    username: `${_prefix}_${uid}${suffix}`,
    email:    `${_prefix}_${uid}${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

afterEach(async () => {
  await query(`DELETE FROM users WHERE email LIKE '${_prefix}_%@example.com'`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFeedback', () => {
  it('inserts a show_request row and returns the expected fields', async () => {
    const user = await makeUser();

    const feedback = await createFeedback({
      userId: user.id,
      type: 'show_request',
      content: 'Please add Mushoku Tensei season 3.',
    });

    expect(feedback).toMatchObject({
      user_id: user.id,
      type: 'show_request',
      content: 'Please add Mushoku Tensei season 3.',
    });
  });

  it('inserts a bug_report row and returns the expected fields', async () => {
    const user = await makeUser();

    const feedback = await createFeedback({
      userId: user.id,
      type: 'bug_report',
      content: 'The star rating rounds down incorrectly.',
    });

    expect(feedback).toMatchObject({
      user_id: user.id,
      type: 'bug_report',
      content: 'The star rating rounds down incorrectly.',
    });
  });

  it('returns an id (UUID) and created_at on the created row', async () => {
    const user = await makeUser();

    const feedback = await createFeedback({
      userId: user.id,
      type: 'bug_report',
      content: 'Something broke.',
    });

    expect(feedback.id).toBeDefined();
    expect(feedback.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(feedback.created_at).toBeDefined();
  });

  it('allows the same user to submit multiple feedback rows', async () => {
    const user = await makeUser();

    const first  = await createFeedback({ userId: user.id, type: 'show_request', content: 'First.' });
    const second = await createFeedback({ userId: user.id, type: 'bug_report', content: 'Second.' });

    expect(first.id).not.toBe(second.id);
  });

  it('rejects an invalid type at the DB level', async () => {
    const user = await makeUser();

    await expect(
      createFeedback({ userId: user.id, type: 'not_a_real_type', content: 'Whatever.' })
    ).rejects.toThrow();
  });

  it('throws a friendly error when the user does not exist', async () => {
    const nonExistentUserId = '00000000-0000-4000-8000-000000000000';

    await expect(
      createFeedback({ userId: nonExistentUserId, type: 'bug_report', content: 'Ghost feedback.' })
    ).rejects.toThrow(/user/i);
  });

  it('defaults resolved to false on insert', async () => {
    const user = await makeUser();

    const feedback = await createFeedback({ userId: user.id, type: 'bug_report', content: 'Default check.' });

    expect(feedback.resolved).toBe(false);
  });
});

describe('resolveFeedback', () => {
  it('sets resolved to true and returns the updated row', async () => {
    const user = await makeUser();
    const feedback = await createFeedback({ userId: user.id, type: 'bug_report', content: 'To resolve.' });

    const resolved = await resolveFeedback(feedback.id);

    expect(resolved.id).toBe(feedback.id);
    expect(resolved.resolved).toBe(true);
  });

  it('returns null for a non-existent id', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const result = await resolveFeedback(nonExistentId);

    expect(result).toBeNull();
  });
});
