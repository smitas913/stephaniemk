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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}

/** Routes accessible only when NOT logged in */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, profileLoading } = useAuth();
  if (loading || profileLoading) return null;
  if (session && profile) {
    // Redirect based on role
    if (["owner", "admin", "consultant"].includes(profile.role)) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/my-account" replace />;
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
    <Route path="/users" element={<ProtectedRoute allowedRoles={["owner"]}><UserManagement /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

/** Temporary redirect component for customers — will be a real portal later */
function CustomerPortalRedirect() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="text-4xl">✨</div>
        <h2 className="text-xl font-bold text-foreground">Welcome, {profile?.full_name || "there"}!</h2>
        <p className="text-sm text-muted-foreground">
          Your customer portal is coming soon. We'll notify you when it's ready.
        </p>
        <button
          onClick={signOut}
          className="text-sm text-primary hover:underline"
        >
          Sign out
        </button>
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
