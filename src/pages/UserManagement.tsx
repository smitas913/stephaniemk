import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, ShieldCheck, ShieldX, UserCog, Plus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Profile = {
  id: string;
  full_name: string | null;
  role: "owner" | "admin" | "staff";
  is_active: boolean;
  created_at: string;
};

export default function UserManagement() {
  const { profile: myProfile, session } = useAuth();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<string>("admin");
  const [creating, setCreating] = useState(false);

  if (myProfile?.role !== "owner") {
    return <Navigate to="/" replace />;
  }

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Profile> }) => {
      const { error } = await supabase.from("profiles").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("User updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword) {
      toast.error("Email and password are required");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create-user",
          email: newEmail,
          password: newPassword,
          full_name: newName || newEmail,
          role: newRole,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("User created successfully");
      setShowAdd(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewRole("admin");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const roleIcon = (role: string) => {
    if (role === "owner") return <ShieldCheck className="w-4 h-4 text-primary" />;
    if (role === "admin") return <Shield className="w-4 h-4 text-primary/70" />;
    return <ShieldX className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCog className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">User Management</h2>
              <p className="text-sm text-muted-foreground">Manage team access and roles</p>
            </div>
          </div>

          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="w-4 h-4" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Stephanie" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="consultant">Consultant</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateUser} className="w-full" disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create User
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No users found</div>
        ) : (
          <div className="grid gap-2">
            {profiles.map((p) => (
              <Card key={p.id} className="border-border/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {roleIcon(p.role)}
                        <span className="font-semibold text-foreground truncate">
                          {p.full_name || "Unnamed User"}
                        </span>
                        {!p.is_active && (
                          <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                        )}
                        {p.id === myProfile?.id && (
                          <Badge variant="secondary" className="text-[10px]">You</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Joined {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={p.role}
                        onValueChange={(role) =>
                          updateProfile.mutate({ id: p.id, updates: { role: role as Profile["role"] } })
                        }
                        disabled={p.id === myProfile?.id}
                      >
                        <SelectTrigger className="w-24 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="consultant">Consultant</SelectItem>
                          <SelectItem value="customer">Customer</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant={p.is_active ? "outline" : "default"}
                        size="sm"
                        className="h-8 text-xs"
                        disabled={p.id === myProfile?.id}
                        onClick={() =>
                          updateProfile.mutate({ id: p.id, updates: { is_active: !p.is_active } })
                        }
                      >
                        {p.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
