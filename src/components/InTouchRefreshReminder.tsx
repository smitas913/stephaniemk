import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ArrowRight } from "lucide-react";
import { useInTouchImportStatus, isDue } from "@/hooks/useInTouchImportStatus";
import { useAuth } from "@/hooks/useAuth";

const ADMIN_ROLES = ["owner", "admin"];

export default function InTouchRefreshReminder() {
  const { profile } = useAuth();
  const { data } = useInTouchImportStatus();
  // Import upkeep is an owner/admin job — the /intouch-refresh page is admin-only,
  // so consultants must not see a banner they can't act on.
  if (!profile || !ADMIN_ROLES.includes(profile.role)) return null;
  if (!data) return null;
  const due = [isDue(data.customers) && "customers", isDue(data.consultants) && "team consultants"].filter(Boolean);
  if (!due.length) return null;
  return (
    <Link to="/intouch-refresh" className="block">
      <Card className="border-amber-300 hover:border-amber-400 transition-colors">
        <CardContent className="p-3 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 mr-2">Due for refresh</Badge>
            InTouch {due.join(" and ")} haven't been imported in over 7 days.
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}
