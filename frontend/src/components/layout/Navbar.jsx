import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoginModal from './LoginModal';

// ─── Sub-components ───────────────────────────────────────────────────────────

function Logo() {
  return (
    <Link to="/" style={s.logo}>
      <span style={s.logoStar}>✦</span>
      ShowRater
    </Link>
  );
}

function HomeButton() {
  return (
    <Link to="/" style={s.btnGhost}>
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
    <div style={s.searchGroup}>
      <div style={s.searchWrap}>
        <svg style={s.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="search"
          placeholder={placeholder}
          aria-label={placeholder}
          style={s.searchInput}
        />
      </div>
      <button type="button" style={s.btnGhost}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
          <line x1="11" y1="18" x2="13" y2="18"/>
        </svg>
        Sort
      </button>
    </div>
  );
}

function AuthButtons({ onOpenLogin }) {
  return (
    <div style={s.authGroup}>
      <button onClick={onOpenLogin} style={s.btnGhost}>Log in</button>
      <Link to="/register" style={s.btnSolid}>Sign up</Link>
    </div>
  );
}

function AccountButton({ user }) {
  return (
    <Link to="/account" style={{ ...s.btnGhost, gap: '8px' }}>
      <span style={s.avatar}>
        {user.username?.[0]?.toUpperCase() ?? '?'}
      </span>
      {user.username}
    </Link>
  );
}

// ─── Styles (all driven by CSS variables from tokens.css) ─────────────────────

const s = {
  navbar: {
    position: 'sticky',
    top: 0,
    zIndex: 40,
    width: '100%',
    height: 'var(--navbar-height)',
    background: 'var(--color-navbar-bg)',
    borderBottom: '1px solid var(--color-navbar-border)',
    boxShadow: 'var(--shadow-sm)',
  },
  inner: {
    maxWidth: '1152px',
    margin: '0 auto',
    height: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '16px',
    padding: '0 24px',
  },
  left:   { display: 'flex', alignItems: 'center' },
  mid:    { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  right:  { display: 'flex', alignItems: 'center', justifyContent: 'flex-end' },

  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'none',
    letterSpacing: '-0.01em',
  },
  logoStar: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: '16px',
    lineHeight: 1,
  },

  btnBase: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 13px',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
    fontFamily: 'var(--font-sans)',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    border: 'none',
  },
  get btnGhost() {
    return {
      ...this.btnBase,
      background: 'var(--color-navbar-btn-bg)',
      color: 'var(--color-navbar-text)',
      border: '1px solid var(--color-navbar-btn-border)',
    };
  },
  get btnSolid() {
    return {
      ...this.btnBase,
      background: '#fff',
      color: 'var(--color-accent)',
      border: '1px solid #fff',
      fontWeight: 600,
    };
  },

  avatar: {
    width: '22px',
    height: '22px',
    borderRadius: 'var(--radius-sm)',
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  authGroup:   { display: 'flex', alignItems: 'center', gap: '8px' },
  searchGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  searchWrap:  { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon:  { position: 'absolute', left: '10px', color: 'var(--color-navbar-search-placeholder)', pointerEvents: 'none' },
  searchInput: {
    height: '34px',
    width: '200px',
    padding: '0 12px 0 30px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-navbar-search-border)',
    background: 'var(--color-navbar-search-bg)',
    color: 'var(--color-navbar-search-text)',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
  },
};

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);

  const isHome    = pathname === '/';
  const isReports = pathname === '/reports';

  const left   = isHome ? <Logo /> : <HomeButton />;
  const center = isHome    ? <SearchSort placeholder="Search titles…"  /> :
                 isReports ? <SearchSort placeholder="Search reports…" /> :
                 null;

  const right = user
    ? <AccountButton user={user} />
    : (
      <div style={s.authGroup}>
        <button onClick={() => setLoginOpen(true)} style={s.btnGhost}>Log in</button>
        <Link to="/register" style={s.btnSolid}>Sign up</Link>
      </div>
    );

  return (
    <>
      <header style={s.navbar}>
        <div style={s.inner}>
          <div style={s.left}>  {left}   </div>
          <div style={s.mid}>   {center} </div>
          <div style={s.right}> {right}  </div>
        </div>
      </header>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}