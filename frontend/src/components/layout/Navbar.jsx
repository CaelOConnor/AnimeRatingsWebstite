import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoginModal from './LoginModal';
import FeedbackModal from './FeedbackModal';
import './Navbar.css';

// ─── Sub-components ──────────────────────────────────────────────────────────
// Display the application's logo and link back to the home page.
function Logo() {
  return (
    <Link to="/" className="navbar__logo">
      <span className="navbar__logo-star">✦</span>
      ShowRater
    </Link>
  );
}

// Display a button that returns the user to the home page.
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

// Available ways to sort the anime list.
// 'recent' now sorts by release/air date (newest first) rather than when the
// row was cached into our DB — labeled "Newest Release" to match.
const SORT_OPTIONS = [
  { value: 'recent',    label: 'Newest Release' },
  { value: 'top_rated', label: 'Top Rated' },
];

// Search bar and sorting controls used on the home page.
function SearchSort({ placeholder, searchQuery, setSearchQuery, sortBy, setSortBy }) {
  // Track whether the sort dropdown is open.
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Reference to the dropdown so clicks outside of it can automatically close the menu.
  const dropdownRef = useRef(null);

  // Close the dropdown when the user clicks anywhere outside of the menu.
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

  // Display the label of the currently selected sort option.
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

// Display account-related navigation for logged-in users.
function AccountButton({ user, onLogout, onOpenFeedback }) {
  // Administrators have access to additional navigation links.
  const isAdmin = user.role_type === 'admin';

  return (
    <div className="navbar__account-group">
      {/* Quick-submit entry points — shown on every page while logged in. */}
      <button
        type="button"
        className="navbar__btn navbar__btn--ghost"
        onClick={() => onOpenFeedback('show_request')}
      >
        Request a show
      </button>
      <button
        type="button"
        className="navbar__btn navbar__btn--ghost"
        onClick={() => onOpenFeedback('bug_report')}
      >
        Report a bug
      </button>
      {isAdmin && (
        <>
          <Link to="/reports" className="navbar__btn navbar__btn--ghost">Reports</Link>
          <Link to="/admin" className="navbar__btn navbar__btn--ghost">Admin</Link>
        </>
      )}
      <Link to={`/users/${user.id}`} className="navbar__account-btn">
        <span className="navbar__avatar">
          {user.username?.[0]?.toUpperCase() ?? '?'}
        </span>
        {user.username}
      </Link>
      <button
        type="button"
        className="navbar__btn navbar__btn--ghost"
        onClick={onLogout}
      >
        Log out
      </button>
    </div>
  );
}

// ─── Navbar ──────────────────────────────────────────────────────────────────
// Main navigation bar displayed across most pages.
export default function Navbar({ searchQuery, setSearchQuery, sortBy, setSortBy }) {
  // Get the current user and information about the current page.
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  // Control whether the login modal is visible.
  const [loginOpen, setLoginOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Which feedback modal (if any) is open: null | 'show_request' | 'bug_report'.
  const [feedbackType, setFeedbackType] = useState(null);

  const isHome    = pathname === '/';
  const isReports = pathname === '/reports';

  // Automatically open the login modal if the URL contains ?login=true.
  useEffect(() => {
    if (searchParams.get('login') === 'true') {
      setLoginOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // Build the three sections of the navigation bar based on the current page and login status.
  const left = isHome ? <Logo /> : <HomeButton />;

  // Show the search bar only on pages where searching is available.
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

  // Show account controls for logged-in users, otherwise display the login and sign-up buttons.
  const right = user
    ? <AccountButton user={user} onLogout={logout} onOpenFeedback={setFeedbackType} />
    : (
      <div className="navbar__auth-group">
        <button onClick={() => setLoginOpen(true)} className="navbar__btn navbar__btn--ghost">Log in</button>
        <Link to="/register" className="navbar__btn navbar__btn--solid">Sign up</Link>
      </div>
    );

  return (
    <>
    {/* Main navigation bar displayed at the top of the page. */}
      <header className="navbar">
        <div className="navbar__inner">
          <div className="navbar__left">  {left}   </div>
          <div className="navbar__mid">   {center} </div>
          <div className="navbar__right"> {right}  </div>
        </div>
      </header>
      
      {/* Login dialog displayed when requested. */}
      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />

      {/* Feedback dialog (show request / bug report) displayed when requested. */}
      <FeedbackModal
        isOpen={feedbackType !== null}
        type={feedbackType}
        onClose={() => setFeedbackType(null)}
      />
    </>
  );
}