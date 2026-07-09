import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import TMDBAttribution from './components/layout/TMDBAttribution/TMDBAttribution';
import './components/layout/TMDBAttribution/TMDBAttribution.css';

// Pages that should not display the navigation bar.
const NO_NAVBAR = ['/register'];

function Layout() {
  // Gets information about the current page's URL.
  const { pathname } = useLocation();

  // Show the navbar on every page except those listed above.
  const showNavbar = !NO_NAVBAR.includes(pathname);

  // Shared state used by the navbar and pages for searching and sorting.
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '32px', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      {/* Render the navbar only on pages that need it.
          The current search and sort state is passed down as props. */}
      {showNavbar && (
        <Navbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      )}
      {/* Outlet renders whichever page matches the current route.
          The search and sort values are provided to child pages through Outlet context. */}
      <Outlet context={{ searchQuery, sortBy }} />
      <TMDBAttribution />
    </div>
  );
}

export default function App() {
  return (
    // AuthProvider makes authentication data available to every component in the application.
    <AuthProvider>
      <Layout />
    </AuthProvider>
  );
}