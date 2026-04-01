import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Orders from "./pages/Orders";
import NewOrder from "./pages/NewOrder";
import OrderDetail from "./pages/OrderDetail";
import Inventory from "./pages/Inventory";
import FollowUps from "./pages/FollowUps";
import Login from "./pages/Login";
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

  // No profile or inactive → access denied
  if (!profile || !profile.is_active) return <Navigate to="/access-denied" replace />;

  // Role check
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/access-denied" element={<AccessDenied />} />
    <Route path="/" element={<ProtectedRoute allowedRoles={["owner", "admin"]}><Dashboard /></ProtectedRoute>} />
    <Route path="/customers" element={<ProtectedRoute allowedRoles={["owner", "admin"]}><Customers /></ProtectedRoute>} />
    <Route path="/customers/:id" element={<ProtectedRoute allowedRoles={["owner", "admin"]}><CustomerDetail /></ProtectedRoute>} />
    <Route path="/orders" element={<ProtectedRoute allowedRoles={["owner", "admin"]}><Orders /></ProtectedRoute>} />
    <Route path="/orders/new" element={<ProtectedRoute allowedRoles={["owner", "admin"]}><NewOrder /></ProtectedRoute>} />
    <Route path="/orders/:id" element={<ProtectedRoute allowedRoles={["owner", "admin"]}><OrderDetail /></ProtectedRoute>} />
    <Route path="/inventory" element={<ProtectedRoute allowedRoles={["owner", "admin"]}><Inventory /></ProtectedRoute>} />
    <Route path="/follow-ups" element={<ProtectedRoute allowedRoles={["owner", "admin"]}><FollowUps /></ProtectedRoute>} />
    <Route path="/users" element={<ProtectedRoute allowedRoles={["owner"]}><UserManagement /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

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
