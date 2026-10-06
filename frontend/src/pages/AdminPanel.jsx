import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "./api";

export default function AdminPanel() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/admin/users")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setUsers(data.users))
      .catch(() => setError("Could not load users"));
  }, []);

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 640 }}>
        <h2>Admin Panel</h2>

        {error && <p className="error">{error}</p>}
        {!users && !error && <p>Loading users...</p>}

        {users && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Username</th>
                <th style={{ textAlign: "left" }}>Email</th>
                <th style={{ textAlign: "left" }}>Role</th>
                <th style={{ textAlign: "left" }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`badge ${u.role === "admin" ? "badge-admin" : "badge-user"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <hr />
        <Link to="/dashboard"><button type="button" className="secondary">Back to dashboard</button></Link>
      </div>
    </div>
  );
}