import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

// Logged-in users only. Everyone else is sent to Login.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page"><p>Loading...</p></div>;
  return user ? children : <Navigate to="/" replace />;
}