import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PeriodProvider } from "@/hooks/usePeriodFilter";
import Landing from "./pages/Landing";
import FollowUpDashboard from "./pages/FollowUpDashboard";
import CustomerList from "./pages/CustomerList";
import CustomerDetail from "./pages/CustomerDetail";
import Orders from "./pages/Orders";
import AddOrder from "./pages/AddOrder";
import EditOrder from "./pages/EditOrder";

import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ResetPassword from "./pages/ResetPassword";
import AccessDenied from "./pages/AccessDenied";
import UserManagement from "./pages/UserManagement";
import ConsultantRequests from "./pages/ConsultantRequests";
import ConsultantRequest from "./pages/ConsultantRequest";
import ImportCustomers from "./pages/ImportCustomers";
import FollowUps from "./pages/FollowUps";
import Prospects from "./pages/Prospects";
import ProspectDetail from "./pages/ProspectDetail";
import AdminTools from "./pages/AdminTools";
import Expenses from "./pages/Expenses";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import Scoreboard from "./pages/Scoreboard";
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
  if (!profile) return <Navigate to="/access-denied" replace />;
  if (!profile.is_active && profile.role === "consultant" && profile.consultant_status === "pending") {
    return <Navigate to="/pending-approval" replace />;
  }
  if (!profile.is_active) return <Navigate to="/access-denied" replace />;
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }

  return <>{children}</>;
}

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
    if (!profile) return <Navigate to="/access-denied" replace />;
    if (!profile.is_active && profile.role === "consultant" && profile.consultant_status === "pending") {
      return <Navigate to="/pending-approval" replace />;
    }
    if (!profile.is_active) return <Navigate to="/access-denied" replace />;
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }
  return <>{children}</>;
}

const ADMIN_ROLES = ["owner", "admin"];
const INTERNAL_ROLES = ["owner", "admin", "consultant"];

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<GuestRoute><Login /></GuestRoute>} />
    <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
    <Route path="/landing" element={<GuestRoute><Landing /></GuestRoute>} />
    <Route path="/signup" element={<GuestRoute><SignUp /></GuestRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/access-denied" element={<AccessDenied />} />
    <Route path="/pending-approval" element={<PendingApproval />} />

    <Route path="/my-account" element={
      <ProtectedRoute allowedRoles={["owner", "admin", "consultant", "customer"]}>
        <CustomerPortalRedirect />
      </ProtectedRoute>
    } />

    <Route path="/dashboard" element={<ProtectedRoute allowedRoles={INTERNAL_ROLES}><FollowUpDashboard /></ProtectedRoute>} />
    <Route path="/customers" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><CustomerList /></ProtectedRoute>} />
    <Route path="/customers/:id" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><CustomerDetail /></ProtectedRoute>} />
    <Route path="/orders" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Orders /></ProtectedRoute>} />
    <Route path="/orders/new" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AddOrder /></ProtectedRoute>} />
    <Route path="/orders/:id/edit" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><EditOrder /></ProtectedRoute>} />
    <Route path="/events" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Events /></ProtectedRoute>} />
    <Route path="/events/:eventId" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><EventDetail /></ProtectedRoute>} />
    <Route path="/import-customers" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><ImportCustomers /></ProtectedRoute>} />
    
    <Route path="/follow-ups" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><FollowUps /></ProtectedRoute>} />
    <Route path="/prospects" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Prospects /></ProtectedRoute>} />
    <Route path="/prospects/:id" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><ProspectDetail /></ProtectedRoute>} />
    <Route path="/expenses" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Expenses /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminTools /></ProtectedRoute>} />
    <Route path="/users" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><UserManagement /></ProtectedRoute>} />
    <Route path="/consultant-requests" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><ConsultantRequests /></ProtectedRoute>} />
    <Route path="/become-consultant" element={<ProtectedRoute allowedRoles={["customer"]}><ConsultantRequest /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

function PendingApproval() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-accent/50 flex items-center justify-center mx-auto">
          <span className="text-2xl">⏳</span>
        </div>
        <h2 className="text-xl font-bold text-foreground">Pending Approval</h2>
        <p className="text-sm text-muted-foreground">
          Your consultant account has been created and is pending verification.
        </p>
        <button onClick={signOut} className="text-sm text-muted-foreground hover:underline">Sign out</button>
      </div>
    </div>
  );
}

function CustomerPortalRedirect() {
  const { profile, signOut } = useAuth();
  const showConsultantOptions = profile?.consultant_status === "none";
  const isPending = profile?.consultant_status === "pending";
  const isRejected = profile?.consultant_status === "rejected";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">✨</div>
          <h2 className="text-2xl font-bold text-foreground">Welcome, {profile?.full_name || "there"}!</h2>
          <p className="text-sm text-muted-foreground">Your customer portal is coming soon.</p>
        </div>
        {showConsultantOptions && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground text-center">Consultant Access</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-center shadow-sm">
                <p className="font-semibold text-foreground text-sm">Already a Consultant?</p>
                <a href="/become-consultant" className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors w-full">Request Access</a>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-center shadow-sm">
                <p className="font-semibold text-foreground text-sm">Want to Become One?</p>
                <a href="/become-consultant" className="inline-flex items-center justify-center rounded-lg border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary/10 transition-colors w-full">Start Request</a>
              </div>
            </div>
          </div>
        )}
        {isPending && (
          <div className="rounded-xl border border-border bg-accent/30 p-4 text-center">
            <p className="text-sm font-medium text-foreground">Request Under Review</p>
          </div>
        )}
        {isRejected && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
            <p className="text-sm font-medium text-foreground">Request Not Approved</p>
          </div>
        )}
        <div className="text-center">
          <button onClick={signOut} className="text-sm text-muted-foreground hover:underline">Sign out</button>
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
          <PeriodProvider>
            <AppRoutes />
          </PeriodProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
