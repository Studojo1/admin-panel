import { redirect } from "react-router";

// The editorial calendar moved to /fellowship-program/calendar.
export function loader() {
  return redirect("/fellowship-program/calendar", 301);
}
