import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

// Admins only. Logged-out users go to Login, regular users go to the Dashboard.
// This only controls what the browser shows; the backend still enforces admin access.
export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!user) return <Navigate to="/" replace />;
  return user.role === "admin" ? children : <Navigate to="/dashboard" replace />;
}