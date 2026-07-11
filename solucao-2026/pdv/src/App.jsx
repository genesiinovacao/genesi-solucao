import { Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './lib/auth';
import Login from './pages/Login';
import PDV from './pages/PDV';

function RequireAuth({ children }) {
  return auth.isAuthenticated() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pdv" element={<RequireAuth><PDV /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/pdv" replace />} />
    </Routes>
  );
}
