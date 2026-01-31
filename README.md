# Studojo Admin Panel

Admin panel application for managing Studojo users, dissertation submissions, and career applications.

## Setup

1. Install dependencies:
```bash
npm install
# or
bun install
```

2. Set environment variables:
```bash
VITE_CONTROL_PLANE_URL=http://localhost:8080
```

3. Run development server:
```bash
npm run dev
# or
bun run dev
```

The admin panel will be available at `http://localhost:3001`.

## Building

```bash
npm run build
# or
bun run build
```

## Production

```bash
npm start
# or
bun start
```

## Authentication

The admin panel requires users to have the `admin` role in the database. Authentication is handled via JWT tokens from the main frontend application.

## Routes

- `/` - Dashboard
- `/users` - User management
- `/dissertations` - Dissertation submissions
- `/careers` - Career applications

## Deployment

The admin panel is deployed as a separate service in Kubernetes. See `k8s/admin-panel/deployment.yaml` for configuration.

