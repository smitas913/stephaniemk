import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserCog, ClipboardList, Upload, RefreshCw } from "lucide-react";
import UserManagement from "@/pages/UserManagement";
import ConsultantRequests from "@/pages/ConsultantRequests";

export default function AdminTools() {
  const { profile } = useAuth();
  const navigate = useNavigate();
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
          <p className="text-sm text-muted-foreground mt-0.5">Manage users, import data, and review requests</p>
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
            <TabsTrigger value="data" className="gap-1.5">
              <Upload className="w-4 h-4" />
              Data Tools
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UserManagement embedded />
          </TabsContent>

          <TabsContent value="requests">
            <ConsultantRequests embedded />
          </TabsContent>

          <TabsContent value="data">
            <div className="grid gap-3 sm:grid-cols-2 max-w-xl mt-4">
              <Card className="border-border/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm text-foreground">Import Customers</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Import customers from a CSV file</p>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/import-customers")}>
                    Go to Import
                  </Button>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm text-foreground">Restore Contact Dates</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Re-import Last Contacted & rebuild follow-ups</p>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => navigate("/restore-contact-dates")}>
                    Restore Dates
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
