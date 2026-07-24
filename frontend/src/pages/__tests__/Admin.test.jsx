import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Admin from '../Admin';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, role_type: 'admin' } }),
}));

const candidate = { id: 42, title: 'Cowboy Bebop', mediaType: 'tv', year: 1998, posterPath: null };

function mockFetch({ addShowStatus, addShowBody }) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = new URL(url);

    if (u.pathname === '/api/admin/users') {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.pathname === '/api/admin/feedback') {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (u.pathname === '/api/admin/anime/search') {
      return { ok: true, status: 200, json: async () => [candidate] };
    }
    if (u.pathname === `/api/anime/fetch/${candidate.id}`) {
      return { ok: true, status: addShowStatus, json: async () => addShowBody };
    }
    throw new Error(`Unexpected fetch: ${u.pathname}`);
  }));
}

function renderAdmin() {
  return render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>
  );
}

async function searchAndConfirm() {
  fireEvent.change(screen.getByPlaceholderText('Show name or TMDB id…'), {
    target: { value: 'Cowboy Bebop' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  await screen.findByText('Cowboy Bebop');
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}

describe('Admin — Add a Show (201 vs 200 via api.raw.post)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports "Added" when the backend responds 201 (newly created)', async () => {
    mockFetch({ addShowStatus: 201, addShowBody: { id: candidate.id, title: candidate.title } });
    renderAdmin();

    await searchAndConfirm();

    expect(await screen.findByText(`Added: ${candidate.title}`)).toBeInTheDocument();
  });

  it('reports "Already in catalog" when the backend responds 200 (already existed)', async () => {
    mockFetch({ addShowStatus: 200, addShowBody: { id: candidate.id, title: candidate.title } });
    renderAdmin();

    await searchAndConfirm();

    expect(await screen.findByText(`Already in catalog: ${candidate.title}`)).toBeInTheDocument();
  });
});
