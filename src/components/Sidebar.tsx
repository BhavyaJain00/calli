"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: string; adminOnly?: boolean };

const items: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "▣" },
  { href: "/dashboard/calls", label: "Calls", icon: "☎" },
  { href: "/dashboard/users", label: "Team", icon: "◉", adminOnly: true },
  { href: "/dashboard/devices", label: "Devices", icon: "▤", adminOnly: true },
  { href: "/dashboard/mobile", label: "Mobile app", icon: "⇩" },
];

function useNav(role: string) {
  const pathname = usePathname();
  return items
    .filter((i) => !i.adminOnly || role === "ADMIN")
    .map((item) => ({
      ...item,
      active:
        item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href),
    }));
}

// Vertical navigation for the desktop sidebar.
export function Sidebar({ role }: { role: string }) {
  const nav = useNav(role);
  return (
    <nav className="flex flex-col gap-1 p-3">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={[
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            item.active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          <span className="w-4 text-center text-base leading-none">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

// Horizontal, scrollable tab bar for phones (the sidebar is hidden there).
export function MobileNav({ role }: { role: string }) {
  const nav = useNav(role);
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={[
            "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
            item.active ? "bg-brand-50 text-brand-700" : "text-slate-600",
          ].join(" ")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
