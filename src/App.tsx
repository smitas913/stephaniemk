import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Orders from "./pages/Orders";
import NewOrder from "./pages/NewOrder";
import OrderDetail from "./pages/OrderDetail";
import Inventory from "./pages/Inventory";
import FollowUps from "./pages/FollowUps";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ResetPassword from "./pages/ResetPassword";
import AccessDenied from "./pages/AccessDenied";
import UserManagement from "./pages/UserManagement";
import ConsultantRequests from "./pages/ConsultantRequests";
import ConsultantRequest from "./pages/ConsultantRequest";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function getRoleHome(role: string): string {
  switch (role) {
    case "owner":
    case "admin":
      return "/dashboard";
    case "consultant":
      return "/dashboard";
    case "customer":
      return "/my-account";
    default:
      return "/my-account";
  }
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { session, profile, loading, profileLoading } = useAuth();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!profile || !profile.is_active) return <Navigate to="/access-denied" replace />;
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    // Redirect to role-appropriate home instead of generic access-denied
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }

  return <>{children}</>;
}

/** Routes accessible only when NOT logged in */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, profileLoading } = useAuth();
  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (session) {
    if (!profile || !profile.is_active) {
      return <Navigate to="/access-denied" replace />;
    }
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }
  return <>{children}</>;
}

const ADMIN_ROLES = ["owner", "admin"];
const INTERNAL_ROLES = ["owner", "admin", "consultant"];

const AppRoutes = () => (
  <Routes>
    {/* Public routes */}
    <Route path="/" element={<GuestRoute><Landing /></GuestRoute>} />
    <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
    <Route path="/signup" element={<GuestRoute><SignUp /></GuestRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/access-denied" element={<AccessDenied />} />

    {/* Customer portal (logged-in customers see this) */}
    <Route path="/my-account" element={
      <ProtectedRoute allowedRoles={["owner", "admin", "consultant", "customer"]}>
        <CustomerPortalRedirect />
      </ProtectedRoute>
    } />

    {/* Internal protected routes */}
    <Route path="/dashboard" element={<ProtectedRoute allowedRoles={INTERNAL_ROLES}><Dashboard /></ProtectedRoute>} />
    <Route path="/customers" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Customers /></ProtectedRoute>} />
    <Route path="/customers/:id" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><CustomerDetail /></ProtectedRoute>} />
    <Route path="/orders" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Orders /></ProtectedRoute>} />
    <Route path="/orders/new" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><NewOrder /></ProtectedRoute>} />
    <Route path="/orders/:id" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><OrderDetail /></ProtectedRoute>} />
    <Route path="/inventory" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Inventory /></ProtectedRoute>} />
    <Route path="/follow-ups" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><FollowUps /></ProtectedRoute>} />
    <Route path="/users" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><UserManagement /></ProtectedRoute>} />
    <Route path="/consultant-requests" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><ConsultantRequests /></ProtectedRoute>} />
    <Route path="/become-consultant" element={<ProtectedRoute allowedRoles={["customer"]}><ConsultantRequest /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

/** Customer welcome page with consultant access options */
function CustomerPortalRedirect() {
  const { profile, signOut } = useAuth();

  const showConsultantOptions = profile?.consultant_status === "none";
  const isPending = profile?.consultant_status === "pending";
  const isRejected = profile?.consultant_status === "rejected";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Welcome header */}
        <div className="text-center space-y-2">
          <div className="text-4xl">✨</div>
          <h2 className="text-2xl font-bold text-foreground">Welcome, {profile?.full_name || "there"}!</h2>
          <p className="text-sm text-muted-foreground">
            Your customer portal is coming soon. We'll notify you when it's ready.
          </p>
        </div>

        {/* Consultant Access section */}
        {showConsultantOptions && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground text-center">Consultant Access</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Existing consultant */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-center shadow-sm">
                <p className="font-semibold text-foreground text-sm">Already a Mary Kay Consultant?</p>
                <p className="text-xs text-muted-foreground">
                  If you're already a consultant, request access to your consultant dashboard.
                </p>
                <a
                  href="/become-consultant"
                  className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors w-full"
                >
                  Request Consultant Access
                </a>
              </div>
              {/* New consultant */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-center shadow-sm">
                <p className="font-semibold text-foreground text-sm">Want to Become a Consultant?</p>
                <p className="text-xs text-muted-foreground">
                  Submit a request and we'll guide you through the next steps.
                </p>
                <a
                  href="/become-consultant"
                  className="inline-flex items-center justify-center rounded-lg border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary/10 transition-colors w-full"
                >
                  Start Consultant Request
                </a>
              </div>
            </div>
          </div>
        )}

        {isPending && (
          <div className="rounded-xl border border-border bg-accent/30 p-4 text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Request Under Review</p>
            <p className="text-xs text-muted-foreground">
              Your consultant access request is being reviewed. We'll notify you once approved.
            </p>
          </div>
        )}

        {isRejected && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Request Not Approved</p>
            <p className="text-xs text-muted-foreground">
              Your consultant request was not approved. Contact an administrator for more info.
            </p>
          </div>
        )}

        <div className="text-center">
          <button onClick={signOut} className="text-sm text-muted-foreground hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
