import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Briefcase, CheckCircle2, XCircle, Clock } from "lucide-react";

export default function ConsultantRequest() {
  const { profile, session, loading, profileLoading, refetchProfile, signOut } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [notes, setNotes] = useState("");
  const [directorInfo, setDirectorInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/access-denied" replace />;

  // Already a consultant or higher
  if (["owner", "admin", "consultant"].includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const status = profile.consultant_status;

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      toast.error("Business name is required");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          consultant_status: "pending",
          business_name: businessName.trim(),
          consultant_notes: notes.trim() || null,
          director_info: directorInfo.trim() || null,
        } as any)
        .eq("id", profile.id);
      if (error) throw error;
      toast.success("Request submitted! An admin will review it shortly.");
      await refetchProfile();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  // Show status for pending/approved/rejected
  if (status === "pending") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <Clock className="w-12 h-12 text-accent-foreground mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Request Pending</h2>
            <p className="text-sm text-muted-foreground">
              Your consultant access request is under review. We'll notify you once a decision is made.
            </p>
            <Badge className="bg-accent text-accent-foreground">Pending Review</Badge>
            <div className="pt-2">
              <button onClick={signOut} className="text-sm text-primary hover:underline">
                Sign out
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <XCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Request Declined</h2>
            <p className="text-sm text-muted-foreground">
              Your consultant access request was not approved. Please contact an administrator for more information.
            </p>
            <Badge variant="destructive">Rejected</Badge>
            <div className="pt-2">
              <button onClick={signOut} className="text-sm text-primary hover:underline">
                Sign out
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
            <h2 className="text-xl font-bold text-foreground">You're Approved!</h2>
            <p className="text-sm text-muted-foreground">
              Your consultant access has been approved. You should now have full consultant access.
            </p>
            <div className="pt-2">
              <button onClick={signOut} className="text-sm text-primary hover:underline">
                Sign out and log back in
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // status === "none" — show form
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Briefcase className="w-10 h-10 text-primary mx-auto mb-2" />
          <CardTitle className="text-xl">Request Consultant Access</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Fill out the form below to apply for consultant access. An admin will review your request.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="businessName">Business Name *</Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your business name"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="directorInfo">Director / Upline (optional)</Label>
            <Input
              id="directorInfo"
              value={directorInfo}
              onChange={(e) => setDirectorInfo(e.target.value)}
              placeholder="Name of your director or upline"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Additional Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why you'd like consultant access…"
              maxLength={1000}
              rows={3}
            />
          </div>
          <Button onClick={handleSubmit} className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Submit Request
          </Button>
          <div className="text-center">
            <button onClick={signOut} className="text-xs text-muted-foreground hover:underline">
              Sign out
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
