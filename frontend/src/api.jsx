export const API = "http://localhost:5000/api";

// Tracks an in-flight refresh so multiple simultaneous 401s
// don't each trigger their own separate refresh call.
let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API}/refresh`, {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}) {
  const doFetch = () =>
    fetch(`${API}${path}`, {
      ...options,
      credentials: "include", // always send/receive cookies
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

  let res = await doFetch();

  // If the access token has expired, try ONE silent refresh, then retry once.
  if (res.status === 401 && path !== "/refresh" && path !== "/login") {
    const refreshRes = await refreshAccessToken();
    if (refreshRes.ok) {
      res = await doFetch(); // retry the original request with the new access token
    }
  }

  return res;
}