import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// ─── small reusable pieces ────────────────────────────────────────────────────

function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-1.5 font-semibold text-white tracking-tight hover:opacity-80 transition-opacity"
    >
      <span className="text-amber-400">★</span>
      <span className="text-sm">ShowRater</span>
    </Link>
  );
}

function HomeButton() {
  return (
    <Link
      to="/"
      className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:border-white/30 hover:text-white transition-all"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      Home
    </Link>
  );
}

function SearchSort({ placeholder }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="search"
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 w-44 rounded-full border border-white/10 bg-white/5 pl-7 pr-3 text-xs text-white placeholder-slate-500 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/20 transition-all"
        />
      </div>
      <button
        type="button"
        className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-3 text-xs text-slate-400 hover:border-white/25 hover:text-white transition-all"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
        </svg>
        Sort
      </button>
    </div>
  );
}

function AuthButtons({ onOpenLogin }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onOpenLogin}
        className="text-xs text-slate-400 hover:text-white transition-colors"
      >
        Log in
      </button>
      <Link
        to="/register"
        className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0d0f14] hover:bg-amber-300 transition-colors"
      >
        Sign up
      </Link>
    </div>
  );
}

function AccountButton({ user }) {
  return (
    <Link
      to="/account"
      className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:border-white/30 hover:text-white transition-all"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      {user.username}
    </Link>
  );
}

// ─── right slot: account or login/signup ─────────────────────────────────────

function RightSlot({ user, onOpenLogin }) {
  if (user) return <AccountButton user={user} />;
  return <AuthButtons onOpenLogin={onOpenLogin} />;
}

// ─── main Navbar ──────────────────────────────────────────────────────────────

export default function Navbar({ onOpenLogin }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const isHome    = pathname === '/';
  const isReports = pathname === '/reports';

  // Determine which left element to show
  const left = isHome ? <Logo /> : <HomeButton />;

  // Determine center content
  let center = null;
  if (isHome)    center = <SearchSort placeholder="Search titles…" />;
  if (isReports) center = <SearchSort placeholder="Search reports…" />;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/8 bg-[#0d0f14]/90 backdrop-blur-md">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-3 items-center px-4">

        {/* Left */}
        <div className="flex items-center">
          {left}
        </div>

        {/* Center */}
        <div className="flex items-center justify-center">
          {center}
        </div>

        {/* Right */}
        <div className="flex items-center justify-end">
          <RightSlot user={user} onOpenLogin={onOpenLogin} />
        </div>

      </div>
    </header>
  );
}