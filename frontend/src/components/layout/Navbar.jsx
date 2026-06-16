import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoginModal from './LoginModal';
import './Navbar.css';

// ─── Sub-components ──────────────────────────────────────────────────────────

function Logo() {
  return (
    <Link to="/" className="navbar__logo">
      <span className="navbar__logo-star">✦</span>
      ShowRater
    </Link>
  );
}

function HomeButton() {
  return (
    <Link to="/" className="navbar__btn navbar__btn--ghost">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      Home
    </Link>
  );
}

const SORT_OPTIONS = [
  { value: 'recent',    label: 'Recently Added' },
  { value: 'top_rated', label: 'Top Rated' },
];

function SearchSort({ placeholder, searchQuery, setSearchQuery, sortBy, setSortBy }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? 'Sort';

  return (
    <div className="navbar__search-group">
      <div className="navbar__search-wrap">
        <svg className="navbar__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="search"
          placeholder={placeholder}
          aria-label={placeholder}
          className="navbar__search-input"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="navbar__sort-wrap" ref={dropdownRef}>
        <button
          type="button"
          className={`navbar__btn navbar__btn--ghost${dropdownOpen ? ' navbar__btn--active' : ''}`}
          onClick={() => setDropdownOpen(prev => !prev)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="11" y1="18" x2="13" y2="18"/>
          </svg>
          {activeSortLabel}
        </button>

        {dropdownOpen && (
          <div className="navbar__sort-dropdown" role="listbox">
            {SORT_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={sortBy === option.value}
                className={`navbar__sort-option${sortBy === option.value ? ' navbar__sort-option--active' : ''}`}
                onClick={() => {
                  setSortBy(option.value);
                  setDropdownOpen(false);
                }}
              >
                {option.value === sortBy && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AccountButton({ user }) {
  return (
    <Link to={`/users/${user.id}`} className="navbar__account-btn">
      <span className="navbar__avatar">
        {user.username?.[0]?.toUpperCase() ?? '?'}
      </span>
      {user.username}
    </Link>
  );
}

// ─── Navbar ──────────────────────────────────────────────────────────────────

export default function Navbar({ searchQuery, setSearchQuery, sortBy, setSortBy }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const isHome    = pathname === '/';
  const isReports = pathname === '/reports';

  useEffect(() => {
    if (searchParams.get('login') === 'true') {
      setLoginOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const left = isHome ? <Logo /> : <HomeButton />;

  const center = isHome ? (
    <SearchSort
      placeholder="Search titles…"
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      sortBy={sortBy}
      setSortBy={setSortBy}
    />
  ) : isReports ? (
    <SearchSort
      placeholder="Search reports…"
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      sortBy={sortBy}
      setSortBy={setSortBy}
    />
  ) : null;

  const right = user
    ? <AccountButton user={user} />
    : (
      <div className="navbar__auth-group">
        <button onClick={() => setLoginOpen(true)} className="navbar__btn navbar__btn--ghost">Log in</button>
        <Link to="/register" className="navbar__btn navbar__btn--solid">Sign up</Link>
      </div>
    );

  return (
    <>
      <header className="navbar">
        <div className="navbar__inner">
          <div className="navbar__left">  {left}   </div>
          <div className="navbar__mid">   {center} </div>
          <div className="navbar__right"> {right}  </div>
        </div>
      </header>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}