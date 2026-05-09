import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import { ProtectedRoute } from './components/ProtectedRoute';

// ── Placeholder pages — replace these as you build them out ──────────────────
function Home() {
  return (
    <div>
      <h1>Welcome to the app</h1>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/"          element={<Home />} />
      <Route path="/login"     element={<Login />} />
      <Route path="/register"  element={<Register />} />

      {/* Example protected routes — uncomment as you build these pages */}
      {/* <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} /> */}
      {/* <Route path="/profile"   element={<ProtectedRoute><Profile /></ProtectedRoute>} /> */}
    </Routes>
  );
}

export default App;