import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "./api";

export default function AdminPanel() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");

    fetch(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load users");
        setUsers(data.users);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <p className="error">{error}</p>
          <button onClick={() => navigate("/dashboard")}>Back to dashboard</button>
        </div>
      </div>
    );
  }

  if (!users) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Admin Panel — All Users</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #c5cbd8" }}>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #eef0f5" }}>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => navigate("/dashboard")}>Back to dashboard</button>
      </div>
    </div>
  );
}