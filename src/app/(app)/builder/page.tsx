// /builder (no projectId) → redirect to dashboard
// [Session 4] Users must enter the builder via /builder/[projectId]
import { redirect } from "next/navigation";

export default function BuilderIndexPage() {
  redirect("/dashboard");
}
