import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/dashboard.tsx"),
  route("login", "routes/login.tsx"),
  route("users", "routes/users.tsx"),
  route("dissertations", "routes/dissertations.tsx"),
  route("careers", "routes/careers.tsx"),
] satisfies RouteConfig;

