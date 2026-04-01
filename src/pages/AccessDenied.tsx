import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldX } from "lucide-react";

export default function AccessDenied() {
  const { signOut, user, profile } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-border/50 shadow-lg">
        <CardContent className="p-8 text-center space-y-4">
          <ShieldX className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            {!profile
              ? "Your account does not have a profile set up. Contact the system owner to get access."
              : !profile.is_active
              ? "Your account has been deactivated. Contact the system owner."
              : "You don't have permission to access this area."}
          </p>
          {user && (
            <p className="text-xs text-muted-foreground">
              Signed in as {user.email}
            </p>
          )}
          <Button onClick={signOut} variant="outline" className="w-full">
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
