import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import UserProfile from '../UserProfile';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '1', role_type: 'user' }, updateUser: vi.fn() }),
}));

const profile = { id: '1', username: 'shonen_fan', bio: '', created_at: '2024-01-01' };

function mockFetch({ saveStatus, saveBody }) {
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    const u = new URL(url);

    if (u.pathname === '/api/users/1' && (!options.method || options.method === 'GET')) {
      return { ok: true, status: 200, json: async () => profile };
    }
    if (u.pathname === '/api/users/1/reviews') {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.pathname === '/api/users/1/watchlist') {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.pathname === '/api/users/1' && options.method === 'PATCH') {
      return { ok: saveStatus < 400, status: saveStatus, json: async () => saveBody };
    }
    throw new Error(`Unexpected fetch: ${options.method ?? 'GET'} ${u.pathname}`);
  }));
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/users/1']}>
      <Routes>
        <Route path="/users/:id" element={<UserProfile />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('UserProfile — profile save distinguishes a 409 username conflict', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a "username already taken" message on a 409 response', async () => {
    mockFetch({ saveStatus: 409, saveBody: { error: 'Username is already taken' } });
    renderProfile();

    await screen.findByDisplayValue('shonen_fan');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('That username is already taken.')).toBeInTheDocument();
  });

  it('shows the backend error message for a non-409 failure', async () => {
    mockFetch({ saveStatus: 500, saveBody: { error: 'Failed to update user.' } });
    renderProfile();

    await screen.findByDisplayValue('shonen_fan');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Failed to update user.')).toBeInTheDocument();
  });
});
