import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API } from "./api";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ name: "", age: "", gender: "" });
  const [profileMsg, setProfileMsg] = useState({ text: "", type: "" });
  const [profileLoading, setProfileLoading] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [pwMsg, setPwMsg] = useState({ text: "", type: "" });
  const [pwLoading, setPwLoading] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setUser(data.user);
        setForm({
          name: data.user.name || "",
          age: data.user.age ?? "",
          gender: data.user.gender || "",
        });
      })
      .catch(() => {
        localStorage.removeItem("token");
        navigate("/", { replace: true });
      });
  }, [navigate, token]);

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileMsg({ text: "", type: "" });
    setProfileLoading(true);
    try {
      const body = {
        name: form.name,
        gender: form.gender || undefined,
        age: form.age === "" ? undefined : Number(form.age),
      };
      const res = await fetch(`${API}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ text: data.error || "Update failed", type: "error" });
        return;
      }
      setUser(data.user);
      setProfileMsg({ text: "Profile updated", type: "success" });
    } catch {
      setProfileMsg({ text: "Cannot reach the server", type: "error" });
    } finally {
      setProfileLoading(false);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPwMsg({ text: "", type: "" });
    setPwLoading(true);
    try {
      const res = await fetch(`${API}/profile/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(pwForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ text: data.error || "Password change failed", type: "error" });
        return;
      }
      setPwMsg({ text: "Password updated", type: "success" });
      setPwForm({ currentPassword: "", newPassword: "" });
    } catch {
      setPwMsg({ text: "Cannot reach the server", type: "error" });
    } finally {
      setPwLoading(false);
    }
  }

  async function handleDelete(e) {
    e.preventDefault();
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API}/profile`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Delete failed");
        return;
      }
      localStorage.removeItem("token");
      navigate("/", { state: { message: "Account deleted" } });
    } catch {
      setDeleteError("Cannot reach the server");
    } finally {
      setDeleteLoading(false);
    }
  }

  if (!user) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 420 }}>
        <h2>Profile</h2>
        <p>Username: {user.username} · Role: {user.role}</p>

        {/* --- Edit name / age / gender --- */}
        <form onSubmit={handleProfileSave} style={{ display: "grid", gap: 12 }}>
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="number"
            placeholder="Age"
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
          />
          <select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>

          {profileMsg.text && <p className={profileMsg.type}>{profileMsg.text}</p>}

          <button type="submit" disabled={profileLoading}>
            {profileLoading ? "Saving..." : "Save changes"}
          </button>
        </form>

        <hr />

        {/* --- Change password --- */}
        <h3>Change password</h3>
        <form onSubmit={handlePasswordChange} style={{ display: "grid", gap: 12 }}>
          <input
            type="password"
            placeholder="Current password"
            value={pwForm.currentPassword}
            onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
            autoComplete="current-password"
          />
          <input
            type="password"
            placeholder="New password (min 6 characters)"
            value={pwForm.newPassword}
            onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
            autoComplete="new-password"
          />

          {pwMsg.text && <p className={pwMsg.type}>{pwMsg.text}</p>}

          <button type="submit" disabled={pwLoading}>
            {pwLoading ? "Updating..." : "Change password"}
          </button>
        </form>

        <hr />

        {/* --- Delete account --- */}
        <h3>Delete account</h3>
        {!confirmingDelete ? (
          <button
            type="button"
            style={{ background: "#c62828" }}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete my account
          </button>
        ) : (
          <form onSubmit={handleDelete} style={{ display: "grid", gap: 12 }}>
            <p className="error">This cannot be undone. Enter your password to confirm.</p>
            <input
              type="password"
              placeholder="Password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            {deleteError && <p className="error">{deleteError}</p>}
            <div className="row">
              <button type="submit" style={{ background: "#c62828" }} disabled={deleteLoading}>
                {deleteLoading ? "Deleting..." : "Confirm delete"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => { setConfirmingDelete(false); setDeleteError(""); setDeletePassword(""); }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <hr />
        <Link to="/dashboard"><button type="button" className="secondary">Back to dashboard</button></Link>
      </div>
    </div>
  );
}