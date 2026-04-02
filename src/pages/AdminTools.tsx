import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCog, ClipboardList } from "lucide-react";
import UserManagement from "@/pages/UserManagement";
import ConsultantRequests from "@/pages/ConsultantRequests";

export default function AdminTools() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin";

  if (!isOwner && !isAdmin) {
    return <Navigate to="/access-denied" replace />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Admin Tools</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage users and review requests</p>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="users" className="gap-1.5">
              <UserCog className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5">
              <ClipboardList className="w-4 h-4" />
              Requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UserManagement embedded />
          </TabsContent>

          <TabsContent value="requests">
            <ConsultantRequests embedded />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
