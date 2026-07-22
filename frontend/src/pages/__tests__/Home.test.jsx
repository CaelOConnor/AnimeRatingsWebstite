import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import Home from '../Home';

// jsdom has no IntersectionObserver — stub one that records every instance
// so tests can manually fire its callback to simulate the sentinel scrolling
// into view.
class MockIntersectionObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
}

function mkAnime(id) {
  return { id, title: `Anime ${id}`, genres: [] };
}

// Home reads { searchQuery, sortBy } via useOutletContext() — supply it the
// same way App.jsx does, through a parent route's <Outlet context={...}>.
function renderHome({ searchQuery = '', sortBy = 'recent' } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Outlet context={{ searchQuery, sortBy }} />}>
          <Route index element={<Home />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Home — pagination', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    MockIntersectionObserver.instances = [];

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get('offset') ?? '0');
      const season = u.searchParams.get('season');

      let results, hasMore;
      if (season === 'winter') {
        results = offset === 0 ? [mkAnime('w1'), mkAnime('w2')] : [];
        hasMore = false;
      } else if (offset === 0) {
        results = [mkAnime('a1'), mkAnime('a2'), mkAnime('a3')];
        hasMore = true;
      } else if (offset === 3) {
        results = [mkAnime('a4'), mkAnime('a5')];
        hasMore = false;
      } else {
        results = [];
        hasMore = false;
      }

      return { ok: true, json: async () => ({ results, hasMore, mode: 'recent' }) };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appends the next page to the existing list when the sentinel scrolls into view', async () => {
    renderHome();

    await screen.findByText('Anime a1');
    expect(screen.getByText('Anime a3')).toBeInTheDocument();
    expect(screen.queryByText('Anime a4')).not.toBeInTheDocument();

    const observer = MockIntersectionObserver.instances.at(-1);
    observer.callback([{ isIntersecting: true }]);

    await screen.findByText('Anime a4');

    // Page 1 is still present — the new page was appended, not swapped in.
    expect(screen.getByText('Anime a1')).toBeInTheDocument();
    expect(screen.getByText('Anime a2')).toBeInTheDocument();
    expect(screen.getByText('Anime a3')).toBeInTheDocument();
    expect(screen.getByText('Anime a5')).toBeInTheDocument();
  });

  it('ignores a second sentinel trigger while a load-more request is already in flight', async () => {
    renderHome();
    await screen.findByText('Anime a1');

    const observer = MockIntersectionObserver.instances.at(-1);
    observer.callback([{ isIntersecting: true }]);
    observer.callback([{ isIntersecting: true }]); // fired again before the first resolves

    await screen.findByText('Anime a4');

    // One request for the initial page, exactly one more for the page that followed —
    // not two, despite the sentinel firing twice back to back.
    const offsetsRequested = fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('offset'));
    expect(offsetsRequested.filter((o) => o === '3')).toHaveLength(1);
  });

  it('resets to offset 0 and replaces the list — instead of appending — when a filter changes', async () => {
    renderHome();
    await screen.findByText('Anime a1');

    // Paginate once so there's pagination progress to discard.
    MockIntersectionObserver.instances.at(-1).callback([{ isIntersecting: true }]);
    await screen.findByText('Anime a4');

    fireEvent.change(screen.getByDisplayValue('All Seasons'), { target: { value: 'winter' } });

    await screen.findByText('Anime w1');

    // The filtered result replaced the old list entirely...
    expect(screen.queryByText('Anime a1')).not.toBeInTheDocument();
    expect(screen.queryByText('Anime a4')).not.toBeInTheDocument();
    expect(screen.getByText('Anime w2')).toBeInTheDocument();

    // ...and the filtered request started over from offset 0, not offset 5.
    const lastCall = fetch.mock.calls.at(-1)[0];
    const lastUrl = new URL(lastCall);
    expect(lastUrl.searchParams.get('season')).toBe('winter');
    expect(lastUrl.searchParams.get('offset')).toBe('0');
  });

  it('does not append a stale in-flight load-more response after a filter change supersedes it', async () => {
    let resolveStalePage;
    fetch.mockImplementation(async (url) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get('offset') ?? '0');
      const season = u.searchParams.get('season');

      if (season === 'winter') {
        return { ok: true, json: async () => ({ results: [mkAnime('w1')], hasMore: false, mode: 'recent' }) };
      }
      if (offset === 0) {
        return { ok: true, json: async () => ({ results: [mkAnime('a1'), mkAnime('a2'), mkAnime('a3')], hasMore: true, mode: 'recent' }) };
      }
      // The load-more page never resolves until the test forces it to,
      // simulating a slow response that lands after the filter changes.
      return new Promise((resolve) => {
        resolveStalePage = () => resolve({ ok: true, json: async () => ({ results: [mkAnime('a4')], hasMore: false, mode: 'recent' }) });
      });
    });

    renderHome();
    await screen.findByText('Anime a1');

    MockIntersectionObserver.instances.at(-1).callback([{ isIntersecting: true }]);
    // Give the load-more request a tick to register as in-flight, then supersede it.
    await waitFor(() => expect(resolveStalePage).toBeDefined());

    fireEvent.change(screen.getByDisplayValue('All Seasons'), { target: { value: 'winter' } });
    await screen.findByText('Anime w1');

    // Now let the stale load-more response resolve — it must be ignored.
    resolveStalePage();
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText('Anime a4')).not.toBeInTheDocument();
    expect(screen.getByText('Anime w1')).toBeInTheDocument();
  });
});
