# Auth App

A full-stack authentication app: register, log in, manage your profile, and an admin-only area. Authentication uses JWTs delivered as httpOnly cookies, with a short-lived access token and a revocable refresh token.

## Features

- Register and log in with a username or an email
- Roles: `user` and `admin`, with a dedicated role-check endpoint
- Dashboard with a welcome message, role badge, and avatar
- Profile: edit name, age, gender and avatar, change username, change password, delete account
- Silent token refresh, and logout that revokes the session on the server
- Admin-only route that lists all users

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React, Vite, React Router |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken), bcryptjs |

## Prerequisites

- Node.js 20 or newer (`node -v`)
- PostgreSQL 14 or newer, running locally (`psql --version`)
- Git

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/rintu783/auth-app.git
cd auth-app
```

### 2. Create the database

Create a database user and a database, then load the tables:

```bash
sudo -u postgres psql -c "CREATE USER auth_user WITH PASSWORD 'choose-a-password';"
sudo -u postgres createdb -O auth_user auth_app
psql "postgresql://auth_user:choose-a-password@localhost:5432/auth_app" -f backend/schema.sql
```

Use the same user, password and database name in `DATABASE_URL` in the next step. This creates the `users` and `refresh_tokens` tables.

### 3. Start the backend

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and set both values:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Your connection string, for example `postgresql://auth_user:choose-a-password@localhost:5432/auth_app` |
| `JWT_SECRET` | A long random string (see below) |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Then install and run:

```bash
npm install
npm run dev
```

The API runs on http://localhost:5000. Check it:

```bash
curl http://localhost:5000/api/health
```

You should see `{"status":"ok", ...}`.

### 4. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

The frontend expects the API at `http://localhost:5000/api` (set in `frontend/src/api.jsx`), and the backend only accepts requests from `http://localhost:5173` (set in `backend/server.js`). If you change a port, change both.

## Using the app

1. Click Register and create an account. You are sent to Login.
2. Log in. You land on the Dashboard.
3. Open Profile to edit your details, change your password, or delete the account.

### Make an admin

There is no public way to become an admin. Promote an account directly in the database:

```bash
sudo -u postgres psql -d auth_app -c "UPDATE users SET role = 'admin' WHERE username = 'yourusername';"
```

Reload the page and the Dashboard shows the admin badge and an Admin Panel button.

## API

All routes are under `/api`. "Auth" means a valid `accessToken` cookie is required.

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | No | Check that the API and database are up |
| POST | `/register` | No | Create an account (`email`, `username`, `password`) |
| POST | `/login` | No | Log in with `identifier` and `password`; sets the cookies |
| POST | `/auth/refresh` | Refresh cookie | Get a new access token |
| POST | `/auth/logout` | Refresh cookie | Revoke the session and clear the cookies |
| GET | `/me` | Yes | Current user's profile |
| GET | `/role` | Yes | Current user's role |
| PATCH | `/profile` | Yes | Update `name`, `age`, `gender`, `avatar` (any subset) |
| PATCH | `/profile/username` | Yes | Change username (needs current password) |
| PATCH | `/profile/password` | Yes | Change password (needs current password); signs out all sessions |
| DELETE | `/profile` | Yes | Delete the account (needs password) |
| GET | `/admin/users` | Admin | List all users |

Errors always come back as `{ "error": "message" }`.

## Project structure

```
auth-app/
├── backend/
│   ├── server.js        API routes and middleware
│   ├── schema.sql       Database tables
│   ├── .env.example     Required environment variables
│   └── package.json
└── frontend/
    ├── src/             React app (pages, API helper, auth context)
    └── package.json
```

## Security notes

- Passwords are hashed with bcrypt and never returned by the API.
- Tokens are httpOnly cookies, so page scripts cannot read them.
- Refresh tokens are stored only as a SHA-256 hash and can be revoked.
- The user id and role come from the verified token and the database, never from the request body.
- `.env` is excluded from Git. Never commit it.

Known limitations: no login rate limiting, no CSRF token (cookies use `sameSite: "lax"`), and development runs over plain HTTP. Cookies are only marked `secure` when `NODE_ENV=production`, which needs HTTPS.

## Troubleshooting

| Problem | Fix |
|---|---|
| `JWT_SECRET is missing in .env` | Create `backend/.env` from `.env.example` and set `JWT_SECRET` |
| `/api/health` says the database is not reachable | Check that PostgreSQL is running and that `DATABASE_URL` is correct |
| `EADDRINUSE` or the server exits right after starting | Port 5000 is taken. Find it with `ss -ltnp \| grep 5000` and stop that process. Stop servers with Ctrl+C, not Ctrl+Z |
| Login works but you are logged out on refresh | Open the app at `http://localhost:5173` exactly, as the CORS setting expects that origin |
| `relation "users" does not exist` | The tables are missing. Run the schema command from setup step 2 |
| `password authentication failed` | The user or password in `DATABASE_URL` doesn't match the database user you created |