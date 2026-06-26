import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCog, ClipboardList, GitMerge } from "lucide-react";
import UserManagement from "@/pages/UserManagement";
import ConsultantRequests from "@/pages/ConsultantRequests";
import MigrateDuplicatesToConsultants from "@/components/MigrateDuplicatesToConsultants";
import MergeDuplicates from "@/components/MergeDuplicates";

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
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage users, consultant requests, and business-wide settings
          </p>
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
            <TabsTrigger value="migrate" className="gap-1.5">
              <GitMerge className="w-4 h-4" />
              Migrate Duplicates
            </TabsTrigger>
            <TabsTrigger value="merge" className="gap-1.5">
              <GitMerge className="w-4 h-4" />
              Merge Duplicates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UserManagement embedded />
          </TabsContent>

          <TabsContent value="requests">
            <ConsultantRequests embedded />
          </TabsContent>

          <TabsContent value="migrate">
            <MigrateDuplicatesToConsultants />
          </TabsContent>

          <TabsContent value="merge">
            <MergeDuplicates />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
