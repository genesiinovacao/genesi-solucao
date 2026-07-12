import { Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './lib/auth';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Sales from './pages/Sales';
import Suppliers from './pages/Suppliers';
import Financial from './pages/Financial';
import Promotions from './pages/Promotions';
import Delivery from './pages/Delivery';
import Reports from './pages/Reports';
import Ai from './pages/Ai';
import Team from './pages/Team';
import Settings from './pages/Settings';
import Layout from './components/Layout';

function RequireAuth({ children }) {
  return auth.isAuthenticated() ? children : <Navigate to="/login" replace />;
}

// Superadmin gerencia a plataforma; clientes caem no dashboard da loja
function HomeRedirect() {
  return <Navigate to={auth.getUser()?.role === 'superadmin' ? '/admin' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="dashboard"  element={<Dashboard />} />
        <Route path="products"   element={<Products />} />
        <Route path="customers"  element={<Customers />} />
        <Route path="sales"      element={<Sales />} />
        <Route path="suppliers"  element={<Suppliers />} />
        <Route path="financial"  element={<Financial />} />
        <Route path="promotions" element={<Promotions />} />
        <Route path="delivery"   element={<Delivery />} />
        <Route path="reports"    element={<Reports />} />
        <Route path="ai"         element={<Ai />} />
        <Route path="team"       element={<Team />} />
        <Route path="settings"   element={<Settings />} />
        <Route path="admin"      element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
