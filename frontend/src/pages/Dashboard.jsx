import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { avatarUrl } from "./avatar";

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  if (loading || !user) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="card">
        <h2 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <img
            src={avatarUrl(user.avatar)}
            alt="avatar"
            style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }}
          />
          <span>
            Welcome {user.name || user.username}{" "}
            <span className={`badge ${user.role === "admin" ? "badge-admin" : "badge-user"}`}>
              {user.role}
            </span>
          </span>
        </h2>

        <p>Email: {user.email}</p>
        <p>Member since: {new Date(user.created_at).toLocaleDateString()}</p>

        <Link to="/profile"><button type="button">Profile</button></Link>

        {user.role === "admin" && (
          <Link to="/admin"><button type="button">Open Admin Panel</button></Link>
        )}

        <button onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
}