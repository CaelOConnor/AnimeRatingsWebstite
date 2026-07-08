import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import TMDBAttribution from './components/layout/TMDBAttribution/TMDBAttribution';
import './components/layout/TMDBAttribution/TMDBAttribution.css';

const NO_NAVBAR = ['/register'];

function Layout() {
  const { pathname } = useLocation();
  const showNavbar = !NO_NAVBAR.includes(pathname);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '32px', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      {showNavbar && (
        <Navbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      )}
      <Outlet context={{ searchQuery, sortBy }} />
      <TMDBAttribution />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Layout />
    </AuthProvider>
  );
}