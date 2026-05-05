"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState, useEffect } from "react";
import { userAuthService } from "@/services/user-auth-service";
import { useAuthConfig } from "@/components/auth/auth-config-provider";
import { useSiteConfig } from "@/components/providers/site-config-provider";
import type { AppUser } from "@/types";
import {
  LayoutDashboard,
  UserCog,
  Sparkles,
  UsersRound,
  ShoppingBag,
  Download,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type UserNavItem = { label: string; href: string; icon: LucideIcon };

const baseNavigation: UserNavItem[] = [
  { label: "Dashboard", href: "/my-account", icon: LayoutDashboard },
  { label: "Account", href: "/account", icon: UserCog },
  { label: "Features", href: "/features", icon: Sparkles },
  { label: "Sub-Users", href: "/sub-users", icon: UsersRound },
  { label: "Purchases", href: "/purchases", icon: ShoppingBag },
  { label: "Downloads", href: "/downloads", icon: Download },
];

export function UserShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AppUser;
}) {
  const pathname = usePathname();
  const navigation = baseNavigation;
  const { title, logo } = useSiteConfig();
  const { signOut: contextSignOut } = useAuthConfig();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-user-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-user-collapsed", String(next));
      return next;
    });
  }

  async function handleLogout() {
    try {
      await userAuthService.logout();
    } catch {
      // Continue even if the API call fails (expired session, network error)
    }
    try {
      await contextSignOut();
    } catch {
      // Clerk signOut may fail if not in Clerk mode
    }
    // Clear any client-side cookies that the browser can access
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      if (name) {
        document.cookie = `${name}=; Path=/; Max-Age=0;`;
      }
    });
    window.location.href = "/user-login";
  }

  const planName = user.activePlan?.name ?? "Free";

  const initials = (user.name ?? user.email)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sidebar = (
    <>
      <div className={`py-6 ${collapsed ? "px-2 flex flex-col items-center" : "px-5"}`}>
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt={title} className="h-8" />
          ) : (
            !collapsed && (
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                {title}
              </h1>
            )
          )}
          {collapsed && !logo && (
            <span className="text-lg font-bold text-foreground">
              {title.charAt(0)}
            </span>
          )}
        </div>
        {!collapsed && (
          <span className="mt-2 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {planName}
          </span>
        )}
      </div>

      {!collapsed && (
        <p className="mb-2 px-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Navigation
        </p>
      )}

      <nav className="flex-1 px-3">
        <ul className="grid gap-0.5">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                    collapsed ? "justify-center" : ""
                  } ${
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={18}
                    className={
                      active
                        ? "text-white"
                        : "text-muted group-hover:text-foreground"
                    }
                  />
                  {!collapsed && item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-4 py-4">
        {!collapsed && (
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {initials}
            </span>
          </div>
        )}
        {!collapsed && user.parent && (
          <p className="mt-2 truncate px-1 text-xs text-muted">
            Account owner: {user.parent.name}
          </p>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
          className={`mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut size={16} />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-full bg-surface/50">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-border bg-background transition-all duration-200 lg:flex lg:flex-col relative ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        {sidebar}
        {/* Collapse toggle button */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted shadow-sm transition-colors hover:text-foreground hover:bg-surface"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-background shadow-xl transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-5 rounded-lg p-1 text-muted hover:text-foreground"
        >
          <X size={20} />
        </button>
        {sidebar}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="flex items-center border-b border-border bg-background px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"
          >
            <Menu size={22} />
          </button>
          <span className="ml-3 text-sm font-semibold text-foreground">
            {title}
          </span>
        </div>
        {user.impersonation && (
          <div className="flex items-center justify-between bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            <span>
              Viewing as <strong>{user.name}</strong> — impersonated by{" "}
              {user.impersonation.adminName}
            </span>
            <button
              onClick={async () => {
                await userAuthService.stopImpersonation();
                window.close();
                // Fallback if window.close() is blocked (not opened via script)
                window.location.href = "/admin/users";
              }}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
              Return to Admin
            </button>
          </div>
        )}
        <div className="px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
