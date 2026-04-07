import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchZoomDefaults, upsertZoomDefaults } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Monitor } from "lucide-react";
import { toast } from "sonner";

export default function ZoomDefaultsSettings() {
  const queryClient = useQueryClient();
  const { data: defaults } = useQuery({ queryKey: ["zoom-defaults"], queryFn: fetchZoomDefaults });

  const [zoomId, setZoomId] = useState("");
  const [zoomPassword, setZoomPassword] = useState("");
  const [zoomLink, setZoomLink] = useState("");

  useEffect(() => {
    if (defaults) {
      setZoomId(defaults.zoom_id || "");
      setZoomPassword(defaults.zoom_password || "");
      setZoomLink(defaults.zoom_link || "");
    }
  }, [defaults]);

  const mutation = useMutation({
    mutationFn: () => upsertZoomDefaults({
      zoom_id: zoomId.trim() || null,
      zoom_password: zoomPassword.trim() || null,
      zoom_link: zoomLink.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zoom-defaults"] });
      toast.success("Zoom defaults saved");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save");
    },
  });

  return (
    <Card className="border-border/50 max-w-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          Zoom Defaults
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">These values will auto-fill when creating a virtual Zoom event.</p>
        <div>
          <label className="text-xs font-medium text-foreground">Default Zoom ID</label>
          <Input value={zoomId} onChange={(e) => setZoomId(e.target.value)} className="h-9 mt-1" placeholder="Meeting ID" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Default Zoom Password</label>
          <Input value={zoomPassword} onChange={(e) => setZoomPassword(e.target.value)} className="h-9 mt-1" placeholder="Password" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Default Zoom Link</label>
          <Input value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} className="h-9 mt-1" placeholder="https://zoom.us/j/..." />
        </div>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : "Save Defaults"}
        </Button>
      </CardContent>
    </Card>
  );
}
