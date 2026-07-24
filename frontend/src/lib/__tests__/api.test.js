import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../api';

function mockFetchOnce({ status, ok, body }) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })));
}

describe('api helper — status-code exposure', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still resolves the shorthand methods (api.get/post/...) to just the parsed body on success', async () => {
    mockFetchOnce({ status: 200, ok: true, body: { id: 1, title: 'Cowboy Bebop' } });

    const result = await api.get('/api/anime/1');

    expect(result).toEqual({ id: 1, title: 'Cowboy Bebop' });
  });

  it('attaches the response status to the thrown error on a non-2xx response', async () => {
    mockFetchOnce({ status: 409, ok: false, body: { error: 'Username is already taken' } });

    await expect(api.patch('/api/users/1', { username: 'taken' })).rejects.toMatchObject({
      message: 'Username is already taken',
      status: 409,
    });
  });

  it('attaches status for other non-2xx codes too (e.g. 500)', async () => {
    mockFetchOnce({ status: 500, ok: false, body: { error: 'Failed to update user.' } });

    await expect(api.patch('/api/users/1', {})).rejects.toMatchObject({ status: 500 });
  });

  it('api.raw.* resolves to { data, status } on success, exposing 201 vs 200', async () => {
    mockFetchOnce({ status: 201, ok: true, body: { id: 5, title: 'New Show' } });

    const result = await api.raw.post('/api/anime/fetch/5');

    expect(result).toEqual({ data: { id: 5, title: 'New Show' }, status: 201 });
  });

  it('api.raw.* distinguishes a 200 (already existed) from a 201 (created)', async () => {
    mockFetchOnce({ status: 200, ok: true, body: { id: 5, title: 'Existing Show' } });

    const result = await api.raw.post('/api/anime/fetch/5');

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ id: 5, title: 'Existing Show' });
  });

  it('api.raw.* still throws with a status property on failure, same as the shorthand methods', async () => {
    mockFetchOnce({ status: 404, ok: false, body: { error: 'Not found' } });

    await expect(api.raw.get('/api/anime/999')).rejects.toMatchObject({ status: 404 });
  });
});
