import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnimeGrid from '../AnimeGrid';

function renderGrid(props) {
  return render(
    <MemoryRouter>
      <AnimeGrid {...props} />
    </MemoryRouter>
  );
}

const animeA = { id: 'a1', title: 'Attack on Titan', genres: [] };
const animeB = { id: 'a2', title: 'Fullmetal Alchemist', genres: [] };

describe('AnimeGrid', () => {
  it('renders a card for each anime when not loading', () => {
    renderGrid({ anime: [animeA, animeB], loading: false });

    expect(screen.getByText('Attack on Titan')).toBeInTheDocument();
    expect(screen.getByText('Fullmetal Alchemist')).toBeInTheDocument();
  });

  it('replaces the grid with skeleton cards while the initial/reset fetch is loading', () => {
    const { container } = renderGrid({ anime: [animeA, animeB], loading: true });

    // Existing anime must not remain on screen during a full reset load —
    // otherwise a stale list from before a filter change could linger.
    expect(screen.queryByText('Attack on Titan')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.anime-grid__skeleton-card').length).toBeGreaterThan(0);
  });

  it('appends trailing skeleton cards during "load more" without wiping existing cards', () => {
    const { container } = renderGrid({ anime: [animeA, animeB], loading: false, loadingMore: true });

    // The cards already on screen must still be present...
    expect(screen.getByText('Attack on Titan')).toBeInTheDocument();
    expect(screen.getByText('Fullmetal Alchemist')).toBeInTheDocument();
    // ...with trailing skeletons appended after them, not replacing them.
    expect(container.querySelectorAll('.anime-grid__skeleton-card').length).toBeGreaterThan(0);
  });

  it('shows no skeleton cards once loadingMore finishes', () => {
    const { container } = renderGrid({ anime: [animeA, animeB], loading: false, loadingMore: false });

    expect(container.querySelectorAll('.anime-grid__skeleton-card').length).toBe(0);
  });

  it('shows the empty message only when not loading and there is no anime', () => {
    renderGrid({ anime: [], loading: false, emptyMessage: 'No anime here yet.' });

    expect(screen.getByText('No anime here yet.')).toBeInTheDocument();
  });
});
