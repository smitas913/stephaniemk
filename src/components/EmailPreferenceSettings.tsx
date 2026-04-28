import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  EMAIL_APP_OPTIONS,
  getPreferredEmailApp,
  setPreferredEmailApp,
  type EmailApp,
} from "@/lib/emailPreference";

export default function EmailPreferenceSettings() {
  const [app, setApp] = useState<EmailApp>("default");

  useEffect(() => {
    setApp(getPreferredEmailApp());
  }, []);

  const handleSelect = (value: EmailApp) => {
    setApp(value);
    setPreferredEmailApp(value);
    toast.success(`Email preference saved`);
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          Preferred Email App
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Choose how email links open across the app.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EMAIL_APP_OPTIONS.map((opt) => {
            const active = app === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "text-left px-3 py-2.5 rounded-lg border-2 transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                <div className="text-sm font-semibold text-foreground">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
