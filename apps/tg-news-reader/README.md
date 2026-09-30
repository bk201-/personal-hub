# TG News Reader

Personal full-stack Telegram news reader. Fetches posts from Telegram channels, stores them locally, and displays them in a clean web UI.

## Tech Stack

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Backend  | Hono (Node.js), TypeScript                          |
| Database | SQLite (local) / Turso (production) via Drizzle ORM |
| Telegram | GramJS                                              |
| Frontend | React 19, Ant Design 6, TanStack Query v5, Zustand  |
| Deploy   | Azure Container Apps + Azure Container Registry     |

## Quick Start

```bash
# Install dependencies
npm install

# Authenticate with Telegram (run once)
npm run tg:auth

# Create a user account
npm run auth:create-user -- your@email.com YourPassword123!

# Apply DB migrations
npm run db:migrate

# Start dev server (backend on :3173, frontend on :5173)
npm run dev
```

## Key Commands

```bash
npm run dev               # Start both server + client
npm run build             # Vite client build
npm run build:server      # TypeScript server type-check
npm run lint              # ESLint
npm run format            # Prettier (fix)
npm run format:check      # Prettier (check only)
npm run db:migrate        # Apply DB migrations
npm run tg:auth           # Re-authenticate Telegram session
```

## Documentation

| File                                         | Contents                                            |
| -------------------------------------------- | --------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                       | Architecture reference for AI agents and developers |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Git workflow, PR process, pre-push checklist        |
| [docs/architecture.md](docs/architecture.md) | Detailed implementation notes per feature           |
| [docs/decisions.md](docs/decisions.md)       | Architectural decisions and resolved bug history    |
| [docs/azure.md](docs/azure.md)               | Azure deployment, env vars, monitoring              |
| [ROADMAP.md](ROADMAP.md)                     | Feature backlog and planning (in Russian)           |

## Project Structure

```
src/
  server/       # Hono API, Drizzle ORM, Telegram service, download workers
  client/       # React app, components, TanStack Query hooks, Zustand stores
  shared/       # Shared TypeScript types
public/
  sw.js         # Service Worker (media cache, production only)
scripts/        # tg-auth.ts, create-user.ts
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. Full reference: [docs/azure.md](docs/azure.md).

**Required for local dev:**

```
TG_API_ID=
TG_API_HASH=
TG_SESSION=        # written by npm run tg:auth
JWT_SECRET=        # any random string
```
