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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true,           element: <Home /> },
      { path: 'register',      element: <Register /> },
      { path: 'anime/:id',     element: <AnimeDetail /> },
      { path: 'reviews/:id',   element: <ReviewDetail /> },
      { path: 'users/:id',     element: <UserProfile /> },

      // Auth required
      { path: 'account',   element: <ProtectedRoute><Account /></ProtectedRoute> },
      { path: 'watchlist', element: <ProtectedRoute><Watchlist /></ProtectedRoute> },

      // Mod + admin only
      { path: 'reports', element: <RoleRoute roles={['moderator', 'admin']}><Reports /></RoleRoute> },

      // Admin only
      { path: 'admin', element: <RoleRoute roles={['admin']}><Admin /></RoleRoute> },
    ],
  },
]);