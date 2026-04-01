import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ShoppingBag, Users, BarChart3 } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container flex items-center justify-between h-14">
          <h1 className="text-lg font-bold tracking-tight text-primary">✨ MK CRM</h1>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-16 md:py-24 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Mary Kay Business Tools
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">
            Manage your Mary Kay business with confidence
          </h2>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Track customers, orders, inventory, and team performance — all in one beautiful, mobile-friendly app.
          </p>
          <div className="flex gap-3 justify-center">
            <Button size="lg" asChild>
              <Link to="/signup">Get Started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container pb-16 md:pb-24">
        <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {[
            { icon: Users, title: "Customer Management", desc: "Keep track of all your customers, their preferences, and follow-up needs." },
            { icon: ShoppingBag, title: "Order Tracking", desc: "Manage orders from creation to payment with full visibility." },
            { icon: BarChart3, title: "Business Insights", desc: "See your revenue, top customers, and growth at a glance." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="container text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} MK CRM. Built with ✨
        </div>
      </footer>
    </div>
  );
}
