import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ClipboardList, CheckCircle2, XCircle } from "lucide-react";

type PendingProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  consultant_notes: string | null;
  director_info: string | null;
  consultant_status: string;
  created_at: string;
};

export default function ConsultantRequests() {
  const { profile: myProfile } = useAuth();
  const queryClient = useQueryClient();

  const isOwner = myProfile?.role === "owner";
  const isAdmin = myProfile?.role === "admin";

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["consultant-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, business_name, consultant_notes, director_info, consultant_status, created_at")
        .eq("consultant_status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as PendingProfile[];
    },
    enabled: isOwner || isAdmin,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const updates: Record<string, string> = {
        consultant_status: approved ? "approved" : "rejected",
      };
      if (approved) {
        (updates as any).role = "consultant";
      }
      const { error } = await supabase.from("profiles").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { approved }) => {
      queryClient.invalidateQueries({ queryKey: ["consultant-requests"] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success(approved ? "Consultant approved!" : "Request rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner && !isAdmin) {
    return <Navigate to="/access-denied" replace />;
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Consultant Requests</h2>
            <p className="text-sm text-muted-foreground">Review pending consultant applications</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No pending requests</div>
        ) : (
          <div className="grid gap-3">
            {requests.map((r) => (
              <Card key={r.id} className="border-border/50 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{r.full_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</p>
                    </div>
                    <Badge className="bg-accent text-accent-foreground text-[10px] shrink-0">Pending</Badge>
                  </div>

                  <div className="text-sm space-y-1">
                    {r.business_name && (
                      <p><span className="font-medium text-foreground">Business:</span> <span className="text-muted-foreground">{r.business_name}</span></p>
                    )}
                    {r.director_info && (
                      <p><span className="font-medium text-foreground">Director/Upline:</span> <span className="text-muted-foreground">{r.director_info}</span></p>
                    )}
                    {r.consultant_notes && (
                      <p><span className="font-medium text-foreground">Notes:</span> <span className="text-muted-foreground">{r.consultant_notes}</span></p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => reviewMutation.mutate({ id: r.id, approved: true })}
                      disabled={reviewMutation.isPending}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => reviewMutation.mutate({ id: r.id, approved: false })}
                      disabled={reviewMutation.isPending}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </Button>
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
