import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchZoomDefaults, upsertZoomDefaults } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Monitor, Home } from "lucide-react";
import { toast } from "sonner";

export default function ZoomDefaultsSettings() {
  const queryClient = useQueryClient();
  const { data: defaults } = useQuery({ queryKey: ["zoom-defaults"], queryFn: fetchZoomDefaults });

  const [zoomId, setZoomId] = useState("");
  const [zoomPassword, setZoomPassword] = useState("");
  const [zoomLink, setZoomLink] = useState("");
  const [homeOfficeAddress, setHomeOfficeAddress] = useState("");

  useEffect(() => {
    if (defaults) {
      setZoomId(defaults.zoom_id || "");
      setZoomPassword(defaults.zoom_password || "");
      setZoomLink(defaults.zoom_link || "");
      setHomeOfficeAddress((defaults as any).home_office_address || "");
    }
  }, [defaults]);

  const mutation = useMutation({
    mutationFn: () => upsertZoomDefaults({
      zoom_id: zoomId.trim() || null,
      zoom_password: zoomPassword.trim() || null,
      zoom_link: zoomLink.trim() || null,
      home_office_address: homeOfficeAddress.trim() || null,
    } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zoom-defaults"] });
      toast.success("Settings saved");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save");
    },
  });

  return (
    <div className="space-y-4 max-w-lg">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            Virtual Event Defaults (Zoom)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Auto-fills when you create a virtual Zoom event.</p>
          <div>
            <label className="text-xs font-medium text-foreground">Zoom Meeting ID</label>
            <Input value={zoomId} onChange={(e) => setZoomId(e.target.value)} className="h-9 mt-1" placeholder="Meeting ID" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Zoom Password</label>
            <Input value={zoomPassword} onChange={(e) => setZoomPassword(e.target.value)} className="h-9 mt-1" placeholder="Password" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Zoom Join Link</label>
            <Input value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} className="h-9 mt-1" placeholder="https://zoom.us/j/..." />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Home className="w-4 h-4 text-primary" />
            My Home Office Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Auto-fills when you select "My Home Office" as the event venue.</p>
          <div>
            <label className="text-xs font-medium text-foreground">Address</label>
            <Input value={homeOfficeAddress} onChange={(e) => setHomeOfficeAddress(e.target.value)} className="h-9 mt-1" placeholder="123 Main St, City, State ZIP" />
          </div>
        </CardContent>
      </Card>

      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
