import { toast } from "sonner";

export type EmailApp = "gmail" | "outlook" | "default" | "copy";

const STORAGE_KEY = "preferredEmailApp";

export const EMAIL_APP_OPTIONS: { value: EmailApp; label: string; description: string }[] = [
  { value: "gmail", label: "Gmail (web)", description: "Open Gmail compose in a new tab" },
  { value: "outlook", label: "Outlook (web)", description: "Open Outlook web compose in a new tab" },
  { value: "default", label: "Default Mail App", description: "Use system default (mailto:)" },
  { value: "copy", label: "Copy Email", description: "Copy address to clipboard" },
];

export function getPreferredEmailApp(): EmailApp {
  if (typeof window === "undefined") return "default";
  const v = window.localStorage.getItem(STORAGE_KEY) as EmailApp | null;
  if (v === "gmail" || v === "outlook" || v === "default" || v === "copy") return v;
  return "default";
}

export function setPreferredEmailApp(app: EmailApp) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, app);
  window.dispatchEvent(new CustomEvent("preferred-email-app-changed", { detail: app }));
}

export function buildEmailUrl(email: string, app: EmailApp = getPreferredEmailApp()): string {
  const e = encodeURIComponent(email);
  switch (app) {
    case "gmail":
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${e}`;
    case "outlook":
      return `https://outlook.office.com/mail/deeplink/compose?to=${e}`;
    case "copy":
    case "default":
    default:
      return `mailto:${email}`;
  }
}

/**
 * Use as an onClick on email <a>/<button>. Honors the user's preferred email app.
 * Pass the event to prevent the default mailto navigation.
 */
export function openEmail(email: string, e?: { preventDefault?: () => void; stopPropagation?: () => void }) {
  e?.preventDefault?.();
  e?.stopPropagation?.();
  if (!email) return;
  const app = getPreferredEmailApp();

  if (app === "copy") {
    const done = () => toast.success(`Copied ${email}`);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(email).then(done).catch(() => {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = email;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch { toast.error("Copy failed"); }
        document.body.removeChild(ta);
      });
    } else {
      toast.error("Clipboard not available");
    }
    return;
  }

  const url = buildEmailUrl(email, app);
  if (app === "default") {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
