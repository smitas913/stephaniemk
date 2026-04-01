import { NavLink } from "react-router-dom";
import { Users, ShoppingBag, LayoutDashboard, Package, Bell } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/follow-ups", label: "Follow-Ups", icon: Bell },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container flex items-center h-14 gap-4 md:gap-8">
          <h1 className="text-lg font-bold tracking-tight text-primary shrink-0">
            ✨ MK CRM
          </h1>
          <nav className="flex gap-0.5 overflow-x-auto">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 md:px-4 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="container py-6 md:py-8">{children}</main>
    </div>
  );
}
