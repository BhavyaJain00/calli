import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { LogoutButton } from "@/components/LogoutButton";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            C
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Calliser</div>
            <div className="truncate text-xs text-slate-400">{user.org.name}</div>
          </div>
        </div>
        <Sidebar role={user.role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-5">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              C
            </div>
            <span className="text-sm font-semibold">Calliser</span>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate text-sm font-medium leading-tight">{user.name}</div>
              <div className="truncate text-xs text-slate-400">{user.email}</div>
            </div>
            <Badge value={user.role} />
            <LogoutButton />
          </div>
        </header>
        <MobileNav role={user.role} />

        <main className="flex-1 overflow-auto p-4 md:p-5">{children}</main>
      </div>
    </div>
  );
}
