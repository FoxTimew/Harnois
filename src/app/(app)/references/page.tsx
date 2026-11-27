import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/auth/require-page-user";
export default async function ReferencesIndex() {
  await requirePageUser("/references", {
    permission: { action: "read", resource: "organizations" },
  });
  redirect("/references/organizations");
}
