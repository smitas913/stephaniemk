import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, ShieldCheck, ShieldX, UserCog, Plus, Loader2, Search, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: "owner" | "admin" | "consultant" | "customer" | "staff";
  is_active: boolean;
  consultant_status: "none" | "pending" | "approved" | "rejected";
  created_at: string;
};

const ALL_ROLES = ["owner", "admin", "consultant", "customer"] as const;

export default function UserManagement({ embedded = false }: { embedded?: boolean }) {
  const { profile: myProfile } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Add user dialog
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<string>("admin");
  const [creating, setCreating] = useState(false);

  const isOwner = myProfile?.role === "owner";
  const isAdmin = myProfile?.role === "admin";

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
    enabled: isOwner || isAdmin,
  });
  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (p.full_name?.toLowerCase().includes(q) ?? false) ||
        (p.email?.toLowerCase().includes(q) ?? false) ||
        (p.phone?.toLowerCase().includes(q) ?? false) ||
        p.role.toLowerCase().includes(q);
      const matchesRole = roleFilter === "all" || p.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && p.is_active) ||
        (statusFilter === "inactive" && !p.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [profiles, search, roleFilter, statusFilter]);

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

  if (!isOwner && !isAdmin) {
    return <Navigate to="/access-denied" replace />;
  }


  const handleRoleChange = (target: Profile, newRole: string) => {
    // Self-lockout prevention
    if (target.id === myProfile?.id) {
      toast.error("You cannot change your own role");
      return;
    }
    // Only owner can assign/remove owner
    if ((newRole === "owner" || target.role === "owner") && !isOwner) {
      toast.error("Only owners can assign or remove the owner role");
      return;
    }
    updateProfile.mutate({ id: target.id, updates: { role: newRole as Profile["role"] } });
  };

  const handleToggleActive = (target: Profile) => {
    if (target.id === myProfile?.id) {
      toast.error("You cannot deactivate your own account");
      return;
    }
    if (target.role === "owner" && !isOwner) {
      toast.error("Only owners can deactivate owner accounts");
      return;
    }
    updateProfile.mutate({ id: target.id, updates: { is_active: !target.is_active } });
  };

  const getRoleOptions = (target: Profile): string[] => {
    if (target.id === myProfile?.id) return [target.role]; // can't change own role
    if (isOwner) return [...ALL_ROLES];
    // Admin: can assign consultant/customer, keep admin, but NOT owner
    if (isAdmin) {
      if (target.role === "owner") return ["owner"]; // admin can't demote owner
      return ["admin", "consultant", "customer"];
    }
    return [target.role];
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword) {
      toast.error("Email and password are required");
      return;
    }
    // Admin cannot create owners
    if (newRole === "owner" && !isOwner) {
      toast.error("Only owners can create owner accounts");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "create-user", email: newEmail, password: newPassword, full_name: newName || newEmail, role: newRole },
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

  const consultantBadge = (status: string) => {
    if (status === "pending") return <Badge className="text-[10px] bg-accent text-accent-foreground">Pending</Badge>;
    if (status === "approved") return <Badge className="text-[10px] bg-primary/15 text-primary">Approved</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>;
    return null;
  };

  const createRoleOptions = isOwner
    ? [...ALL_ROLES]
    : (["admin", "consultant", "customer"] as const);

  const content = (
      <div className="max-w-3xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <UserCog className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">User Management</h2>
              <p className="text-sm text-muted-foreground">Manage team access and roles</p>
            </div>
          </div>

          {(isOwner || isAdmin) && (
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
                        {createRoleOptions.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                        ))}
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
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone, or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* User list */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No users found</div>
        ) : (
          <div className="grid gap-2">
            {filtered.map((p) => {
              const roleOptions = getRoleOptions(p);
              const isSelf = p.id === myProfile?.id;

              return (
                <Card key={p.id} className="border-border/50 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {roleIcon(p.role)}
                          <span className="font-semibold text-foreground truncate">
                            {p.full_name || "Unnamed User"}
                          </span>
                          {!p.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                          {consultantBadge(p.consultant_status)}
                          {isSelf && <Badge variant="secondary" className="text-[10px]">You</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {p.email}{p.phone ? ` · ${p.phone}` : ""} · Joined {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={p.role}
                          onValueChange={(role) => handleRoleChange(p, role)}
                          disabled={isSelf || roleOptions.length <= 1}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map((r) => (
                              <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant={p.is_active ? "outline" : "default"}
                          size="sm"
                          className="h-8 text-xs"
                          disabled={isSelf || (p.role === "owner" && !isOwner)}
                          onClick={() => handleToggleActive(p)}
                        >
                          {p.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} of {profiles.length} users shown
        </p>
      </div>
    </Layout>
  );
}
