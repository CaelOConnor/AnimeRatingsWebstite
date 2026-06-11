import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';

const NO_NAVBAR = ['/register'];

function Layout() {
  const { pathname } = useLocation();
  const showNavbar = !NO_NAVBAR.includes(pathname);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {showNavbar && <Navbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
      <Outlet context={{ searchQuery }} />
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