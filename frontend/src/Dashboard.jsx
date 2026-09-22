import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
        // token missing, fake, or expired
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
        <h2>Dashboard</h2>
        <p>Welcome, <strong>{user.username}</strong></p>
        <p>Email: {user.email}</p>
        <p>Member since: {new Date(user.created_at).toLocaleDateString()}</p>
        <button onClick={logout}>Logout</button>
      </div>
    </div>
  );
}