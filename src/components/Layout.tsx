import { NavLink } from "react-router-dom";
import { Users, ShoppingBag, LayoutDashboard, LogOut, Settings, Clock, Menu, X, UserPlus, Receipt, Calendar, Target, CalendarCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scoreboard", label: "Scoreboard", icon: Target },
  { to: "/follow-ups", label: "Today", icon: Clock },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/events", label: "Events", icon: Calendar },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/prospects", label: "Prospects", icon: UserPlus },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/admin", label: "Admin", icon: Settings, adminOnly: true },
];

const consultantNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

function getNavItems(role?: string) {
  if (role === "owner" || role === "admin") return adminNavItems;
  if (role === "consultant") return consultantNavItems;
  return [];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth();
  const navItems = getNavItems(profile?.role);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when menu open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center h-14 gap-4 md:gap-8">
          <h1 className="text-lg font-bold tracking-tight text-primary shrink-0">✨ MK CRM</h1>

          {/* Desktop nav */}
          <nav className="hidden md:flex flex-wrap gap-0.5 flex-1 min-w-0">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/dashboard"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {profile && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase hidden sm:inline">
                {profile.role}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hidden md:flex" onClick={signOut} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile overlay + drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute top-0 right-0 h-full w-4/5 max-w-xs bg-card border-l border-border shadow-xl animate-slide-in-right flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between h-14 px-4 border-b border-border">
              <span className="text-lg font-bold text-primary">✨ MK CRM</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/dashboard"}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Footer */}
            <div className="border-t border-border p-4 space-y-3">
              {profile && (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase">
                    {profile.role}
                  </span>
                  {profile.full_name && (
                    <span className="text-sm text-muted-foreground truncate">{profile.full_name}</span>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => { setMobileOpen(false); signOut(); }}
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="container py-6 md:py-8">{children}</main>
    </div>
  );
}
