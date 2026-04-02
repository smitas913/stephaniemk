import { NavLink } from "react-router-dom";
import { Users, ShoppingBag, LayoutDashboard, Package, LogOut, UserCog, ClipboardList, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const adminNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/users", label: "Users", icon: UserCog },
  { to: "/consultant-requests", label: "Requests", icon: ClipboardList },
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center h-14 gap-4 md:gap-8">
          <h1 className="text-lg font-bold tracking-tight text-primary shrink-0">✨ MK CRM</h1>
          <nav className="flex gap-0.5 overflow-x-auto flex-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/dashboard"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 md:px-4 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1 shrink-0">
            {profile && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase hidden sm:inline">
                {profile.role}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={signOut} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-6 md:py-8">{children}</main>
    </div>
  );
}
