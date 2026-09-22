import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API } from "./api";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");

    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("token");
        navigate("/", { replace: true });
      });
  }, [navigate]);

  function logout() {
    localStorage.removeItem("token");
    navigate("/", { replace: true });
  }

  if (!user) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="card">
        <h2>
          Welcome {user.name || user.username}{" "}
          <span className={`badge ${user.role === "admin" ? "badge-admin" : "badge-user"}`}>
            {user.role}
          </span>
        </h2>

        <p>Email: {user.email}</p>
        <p>Member since: {new Date(user.created_at).toLocaleDateString()}</p>

        <Link to="/profile"><button type="button">Profile</button></Link>

        {user.role === "admin" && (
          <Link to="/admin"><button type="button">Open Admin Panel</button></Link>
        )}

        <button onClick={logout}>Logout</button>
      </div>
    </div>
  );
}