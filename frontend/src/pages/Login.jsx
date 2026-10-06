import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { apiFetch } from "./api";
import { useAuth } from "./AuthContext.jsx";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  // Shows a one-time message passed via navigate("/", { state: { message } }),
  // e.g. after a password change or account deletion.
  const infoMessage = location.state?.message;

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      setUser(data.user); // no token to store — cookies were set by the server automatically
      navigate("/dashboard");
    } catch {
      setError("Cannot reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Login</h2>

        {infoMessage && <p className="success">{infoMessage}</p>}

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <input
            placeholder="Username or email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p>
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}