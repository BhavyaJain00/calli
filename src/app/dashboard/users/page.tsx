import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { UsersManager } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="text-sm text-slate-500">
          Create and manage sales-department accounts.
        </p>
      </div>
      <UsersManager currentUserId={user.id} />
    </div>
  );
}
