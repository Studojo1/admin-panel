import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/dashboard.tsx"),
  route("login", "routes/login.tsx"),
  route("users", "routes/users.tsx"),
  route("partner-users", "routes/partner-users.tsx"),
  route("partner-users/new", "routes/partner-users/new.tsx"),
  route("partner-users/:id", "routes/partner-users/$id.tsx"),
  route("api/partner-users", "routes/api.partner-users.tsx"),
  route("api/partner-users/:id", "routes/api.partner-users.$id.tsx"),
  route("api/companies", "routes/api.companies.tsx"),
  route("assignments", "routes/assignments.tsx"),
  route("dissertations", "routes/dissertations.tsx"),
  route("careers", "routes/careers.tsx"),
  route("settings", "routes/settings.tsx"),
  route("api/settings", "routes/api.settings.tsx"),
] satisfies RouteConfig;

