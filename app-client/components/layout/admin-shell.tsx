"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState, useEffect } from "react";
import useSWR from "swr";
import { authService } from "@/services/auth-service";
import { useSiteConfig } from "@/components/providers/site-config-provider";
import { swrListFetcher } from "@/lib/swr";
import type { AuthUser, ContentType } from "@/types";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Package,
  ToggleRight,
  BarChart3,
  Activity,
  Settings,
  UserCircle,
  LogOut,
  Menu,
  X,
  FileText,
  Layers,
  Tags,
  Image,
  LayoutTemplate,
  ChevronDown,
  ChevronRight,
  FileBox,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type AdminNavItem = { label: string; href: string; icon: LucideIcon };

const coreNav: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Admins", href: "/admin/admins", icon: ShieldCheck },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Features", href: "/admin/features", icon: ToggleRight },
];

const cmsNav: AdminNavItem[] = [
  { label: "Pages", href: "/admin/pages", icon: FileText },
  {
    label: "Block Templates",
    href: "/admin/block-templates",
    icon: LayoutTemplate,
  },
  { label: "Media", href: "/admin/media", icon: Image },
];

const cmsAdminNav: AdminNavItem[] = [
  { label: "Content Types", href: "/admin/content-types", icon: Layers },
  { label: "Taxonomies", href: "/admin/taxonomies", icon: Tags },
];

const bottomNav: AdminNavItem[] = [
  { label: "Reports", href: "/admin/reports", icon: BarChart3 },
  { label: "Activity", href: "/admin/activity", icon: Activity },
  { label: "Settings", href: "/admin/settings", icon: Settings },
  { label: "Profile", href: "/admin/profile", icon: UserCircle },
];

export function AdminShell({
  children,
  admin,
}: {
  children: ReactNode;
  admin: AuthUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { title, logo } = useSiteConfig();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cmsOpen, setCmsOpen] = useState(
    pathname.startsWith("/admin/pages") ||
      pathname.startsWith("/admin/block-templates") ||
      pathname.startsWith("/admin/media") ||
      pathname.startsWith("/admin/content"),
  );

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-admin-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-admin-collapsed", String(next));
      return next;
    });
  }

  const { data: contentTypes = [] } = useSWR<ContentType[]>(
    "/api/cms/content-types",
    swrListFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const activeTypes = contentTypes.filter((ct) => ct.status === "active");

  async function handleLogout() {
    await authService.logout();
    router.replace("/login");
  }

  const initials = (admin.name ?? admin.email)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function NavLink({ item }: { item: AdminNavItem }) {
    const Icon = item.icon;
    const active =
      item.href === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(item.href);
    return (
      <li>
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
              active ? "text-white" : "text-muted group-hover:text-foreground"
            }
          />
          {!collapsed && item.label}
        </Link>
      </li>
    );
  }

  const isCmsActive =
    pathname.startsWith("/admin/pages") ||
    pathname.startsWith("/admin/block-templates") ||
    pathname.startsWith("/admin/media") ||
    pathname.startsWith("/admin/content");

  const sidebar = (
    <>
      <div className={`flex items-center gap-3 py-6 ${collapsed ? "justify-center px-2" : "px-5"}`}>
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

      <nav className="flex-1 overflow-y-auto px-3">
        {!collapsed && (
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            General
          </p>
        )}
        <ul className="grid gap-0.5">
          {coreNav.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </ul>

        {/* CMS section with collapsible content types */}
        {!collapsed && (
          <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            CMS
          </p>
        )}
        {collapsed && <div className="mt-4 border-t border-border pt-4" />}
        <ul className="grid gap-0.5">
          {cmsNav.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          {/* Dynamic content types as sub-items */}
          {activeTypes.length > 0 && !collapsed && (
            <li>
              <button
                type="button"
                onClick={() => setCmsOpen((o) => !o)}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                  isCmsActive && !cmsOpen
                    ? "text-primary"
                    : "text-muted hover:bg-surface hover:text-foreground"
                }`}
              >
                <Layers
                  size={18}
                  className="text-muted group-hover:text-foreground"
                />
                <span className="flex-1 text-left">Content</span>
                {cmsOpen ? (
                  <ChevronDown size={14} className="text-muted" />
                ) : (
                  <ChevronRight size={14} className="text-muted" />
                )}
              </button>
              {cmsOpen && (
                <ul className="ml-5 mt-0.5 grid gap-0.5 border-l border-border pl-3">
                  {activeTypes.map((ct) => {
                    const href = `/admin/content/${ct.slug}`;
                    const active = pathname === href;
                    return (
                      <li key={ct.slug}>
                        <Link
                          href={href}
                          onClick={() => setMobileOpen(false)}
                          className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-150 ${
                            active
                              ? "bg-primary text-white shadow-sm"
                              : "text-muted hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          <FileBox
                            size={15}
                            className={
                              active
                                ? "text-white"
                                : "text-muted group-hover:text-foreground"
                            }
                          />
                          {ct.pluralName || ct.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          )}

          {cmsAdminNav.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </ul>

        {!collapsed && (
          <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            System
          </p>
        )}
        {collapsed && <div className="mt-4 border-t border-border pt-4" />}
        <ul className="grid gap-0.5">
          {bottomNav.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
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
                {admin.name}
              </p>
              <p className="truncate text-xs text-muted">{admin.email}</p>
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
        <div className="px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
