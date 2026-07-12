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
import Settings from './pages/Settings';
import Layout from './components/Layout';

function RequireAuth({ children }) {
  return auth.isAuthenticated() ? children : <Navigate to="/login" replace />;
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
        <Route index element={<Navigate to="/dashboard" replace />} />
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
        <Route path="settings"   element={<Settings />} />
        <Route path="admin"      element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
