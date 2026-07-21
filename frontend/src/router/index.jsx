import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import Home         from '../pages/Home';
import Register     from '../pages/Register';
import AnimeDetail  from '../pages/AnimeDetail';
import ReviewDetail from '../pages/ReviewDetail';
import UserProfile  from '../pages/UserProfile';
import Account      from '../pages/Account';
import Watchlist    from '../pages/Watchlist';
import Reports      from '../pages/Reports';
import Admin        from '../pages/Admin';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute      from './RoleRoute';

// Defines all of the application's routes (pages).
// React Router uses this configuration to determine which component to display for each URL.
export const router = createBrowserRouter([
  {
    // The root route renders the App component, which contains
    // the shared layout (navbar, footer, etc.) and an <Outlet> where child pages are displayed.
    path: '/',
    element: <App />,
    children: [
      // Public routes that anyone can access.
      { index: true,           element: <Home /> },
      { path: 'register',      element: <Register /> },
      { path: 'anime/:id',     element: <AnimeDetail /> }, // ':id' is a URL parameter. For example, '/anime/42' will set id = 42 so the page knows which anime to display.
      { path: 'reviews/:id',   element: <ReviewDetail /> },
      { path: 'users/:id',     element: <UserProfile /> },

      // Auth required Routes that require the user to be logged in.
      { path: 'account',   element: <ProtectedRoute><Account /></ProtectedRoute> },
      { path: 'watchlist', element: <ProtectedRoute><Watchlist /></ProtectedRoute> },

      // Mod + admin only
      { path: 'reports', element: <RoleRoute roles={['moderator', 'admin']}><Reports /></RoleRoute> },

      // Mod + admin — Admin.jsx's Users section actions (ban/unban/delete) are
      // still effectively admin-focused in practice, but the route itself now
      // matches the backend's actual permission model (GET /api/admin/feedback
      // and /api/admin/reports both allow moderators too), same as /reports.
      { path: 'admin', element: <RoleRoute roles={['moderator', 'admin']}><Admin /></RoleRoute> },
    ],
  },
]);