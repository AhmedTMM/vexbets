import { redirect } from "next/navigation";

// Listen now lives in the sidebar on every page, so this address goes to the dashboard.
export default function ListenPage() {
  redirect("/");
}
