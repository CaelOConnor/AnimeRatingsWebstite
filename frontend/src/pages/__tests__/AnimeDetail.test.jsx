import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AnimeDetail from '../AnimeDetail';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isLoggedIn: false, user: null }),
}));

// Same show, different seasons — each season is its own DB row/route in this
// app, sharing one series-level backdrop_path but each with its own
// season-specific poster_path (mirrors what fetchFromTmdb in
// backend/routes/anime.js actually produces).
const SHOW_BACKDROP = '/series-backdrop.jpg';
const seasonOne = {
  id: 'aot-s1', title: 'Attack on Titan — Season 1',
  poster_path: '/season-1-poster.jpg', backdrop_path: SHOW_BACKDROP,
  genres: [], season_number: 1,
};
const seasonTwo = {
  id: 'aot-s2', title: 'Attack on Titan — Season 2',
  poster_path: '/season-2-poster.jpg', backdrop_path: SHOW_BACKDROP,
  genres: [], season_number: 2,
};
const seasonNoPoster = {
  id: 'aot-special', title: 'Attack on Titan — Special',
  poster_path: null, backdrop_path: SHOW_BACKDROP,
  genres: [], season_number: 0,
};
const singleSeasonShow = {
  id: 'fma', title: 'Fullmetal Alchemist',
  poster_path: '/fma-poster.jpg', backdrop_path: '/fma-backdrop.jpg',
  genres: [],
};

function mockFetchFor(animeById) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = new URL(url);
    const match = u.pathname.match(/^\/api\/anime\/(.+)$/);
    if (match) {
      const anime = animeById[match[1]];
      return anime
        ? { ok: true, status: 200, json: async () => anime }
        : { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    }
    if (u.pathname === '/api/reviews') {
      return { ok: true, status: 200, json: async () => [] };
    }
    throw new Error(`Unexpected fetch: ${u.pathname}`);
  }));
}

function renderDetail(id) {
  return render(
    <MemoryRouter initialEntries={[`/anime/${id}`]}>
      <Routes>
        <Route path="/anime/:id" element={<AnimeDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

function backdropStyle(container) {
  return container.querySelector('.anime-detail__backdrop')?.style.backgroundImage;
}

describe('AnimeDetail — per-season background image', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses this season's own poster_path for the background, not the show-level backdrop_path", async () => {
    mockFetchFor({ 'aot-s1': seasonOne });
    const { container } = renderDetail('aot-s1');

    await waitFor(() => expect(backdropStyle(container)).toBeTruthy());

    expect(backdropStyle(container)).toContain('season-1-poster.jpg');
    expect(backdropStyle(container)).not.toContain('series-backdrop.jpg');
  });

  it('shows a different background when viewing a different season of the same show', async () => {
    mockFetchFor({ 'aot-s1': seasonOne, 'aot-s2': seasonTwo });

    const first = renderDetail('aot-s1');
    await waitFor(() => expect(backdropStyle(first.container)).toBeTruthy());
    const firstBackground = backdropStyle(first.container);

    const second = renderDetail('aot-s2');
    await waitFor(() => expect(backdropStyle(second.container)).toBeTruthy());
    const secondBackground = backdropStyle(second.container);

    expect(firstBackground).toContain('season-1-poster.jpg');
    expect(secondBackground).toContain('season-2-poster.jpg');
    expect(firstBackground).not.toBe(secondBackground);
  });

  it('falls back to the show-level backdrop when this season has no poster of its own', async () => {
    mockFetchFor({ 'aot-special': seasonNoPoster });
    const { container } = renderDetail('aot-special');

    await waitFor(() => expect(backdropStyle(container)).toBeTruthy());

    expect(backdropStyle(container)).toContain('series-backdrop.jpg');
  });

  it('still renders a background normally for a single-season show', async () => {
    mockFetchFor({ fma: singleSeasonShow });
    const { container } = renderDetail('fma');

    await waitFor(() => expect(backdropStyle(container)).toBeTruthy());

    expect(backdropStyle(container)).toContain('fma-poster.jpg');
  });
});
