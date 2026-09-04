import { NavLink } from "react-router-dom";
import {
  Users,
  ShoppingBag,
  LayoutDashboard,
  LogOut,
  Settings,
  Clock,
  Menu,
  X,
  Calendar,
  Target,
  Crown,
  TrendingUp,
  Receipt,
  Mail,
  MessageSquare,
  BookOpen,
  MoreHorizontal,
  FileText,
  Droplets,

} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const primaryNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/follow-ups", label: "Today", icon: Clock },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/events", label: "Events", icon: Calendar },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/leadership", label: "Leadership", icon: Crown },
];

const secondaryNavItems = [
  { to: "/performance", label: "Averages", icon: TrendingUp },

  { to: "/analytics", label: "Analytics", icon: Target },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/campaigns", label: "Campaigns", icon: BookOpen },
  { to: "/mailing-lists", label: "Mailing Lists", icon: Mail },
  { to: "/communications", label: "Comms", icon: MessageSquare },
  { to: "/scripts", label: "Scripts", icon: FileText },
  { to: "/settings", label: "My Settings", icon: Settings, adminOnly: false },
  { to: "/admin", label: "Admin", icon: Settings, adminOnly: true },
];

const consultantNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/follow-ups", label: "Today", icon: Clock },
];

function getNavItems(role?: string) {
  if (role === "owner" || role === "admin") return { primary: primaryNavItems, secondary: secondaryNavItems };
  if (role === "consultant") return { primary: consultantNavItems, secondary: [] };
  return { primary: [], secondary: [] };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth();
  const { primary: primaryNav, secondary: secondaryNav } = getNavItems(profile?.role);
  const allNavItems = [...primaryNav, ...secondaryNav];
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
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isSecondaryActive = secondaryNav.some((item) => location.pathname.startsWith(item.to));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center h-14 gap-4 md:gap-8">
          <h1 className="text-lg font-bold tracking-tight text-primary shrink-0">✨ MK CRM</h1>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
            {primaryNav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/dashboard"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}

            {secondaryNav.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0",
                      isSecondaryActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                    <span>More</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {secondaryNav.map(({ to, label, icon: Icon }) => (
                    <DropdownMenuItem key={to} asChild>
                      <NavLink
                        to={to}
                        end={to === "/dashboard"}
                        className={({ isActive }) =>
                          cn("flex items-center gap-2 w-full cursor-pointer", isActive && "font-semibold text-primary")
                        }
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>

          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {profile && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase hidden sm:inline">
                {profile.role}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hidden md:flex"
              onClick={signOut}
              title="Sign out"
            >
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
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
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

            {/* Nav items - primary */}
            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
              {primaryNav.map(({ to, label, icon: Icon }) => (
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
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                </NavLink>
              ))}

              {secondaryNav.length > 0 && (
                <>
                  <div className="pt-3 pb-1 px-4">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">More</span>
                  </div>
                  {secondaryNav.map(({ to, label, icon: Icon }) => (
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
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )
                      }
                    >
                      <Icon className="w-5 h-5" />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </>
              )}
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
                onClick={() => {
                  setMobileOpen(false);
                  signOut();
                }}
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
