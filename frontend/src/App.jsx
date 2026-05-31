import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import LoginModal from './components/layout/LoginModal';

// Pages that render without a navbar
const NO_NAVBAR = ['/register'];

function Layout() {
  const [loginOpen, setLoginOpen] = useState(false);
  const { pathname } = useLocation();

  const showNavbar = !NO_NAVBAR.includes(pathname);

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white">
      {showNavbar && (
        <Navbar onOpenLogin={() => setLoginOpen(true)} />
      )}
      <Outlet />
      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
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