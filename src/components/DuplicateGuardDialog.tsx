import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, UserCheck, UserPlus } from "lucide-react";
import { formatPhone } from "@/lib/phoneUtils";
import type { DuplicateMatch } from "@/lib/duplicateCheck";

/**
 * Prompt shown when a pre-insert duplicate check finds an existing person.
 * `strong` = phone/email match (definite duplicate).
 * `softName` = same-name-only match (possible duplicate).
 */
export default function DuplicateGuardDialog({
  open,
  onOpenChange,
  strong,
  softName,
  attemptedName,
  targetKind,
  onLinkExisting,
  onCreateAnyway,
  linkLabel = "Link to existing",
  createLabel = "Create new anyway",
  linkPending = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  strong: DuplicateMatch | null;
  softName: DuplicateMatch | null;
  attemptedName: string;
  targetKind: "customer" | "consultant" | "prospect";
  onLinkExisting: (match: DuplicateMatch) => void | Promise<void>;
  onCreateAnyway: () => void | Promise<void>;
  linkLabel?: string;
  createLabel?: string;
  linkPending?: boolean;
}) {
  const match = strong || softName;
  if (!match) return null;

  const isStrong = !!strong;
  const isSameKind = match.kind === targetKind;
  const dateLabel = match.kind === "consultant"
    ? (match.extra?.join_date ? `joined ${match.extra.join_date}` : "existing consultant")
    : (match.extra?.date_added ? `added ${match.extra.date_added}` : "existing customer");

  const reasonText =
    match.reason === "phone" ? "same phone number" :
    match.reason === "email" ? "same email address" :
    "same name only";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${isStrong ? "text-destructive" : "text-amber-500"}`} />
            {isStrong ? "Possible duplicate found" : "Possible duplicate — same name only"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p>
                <span className="font-medium text-foreground">{match.name}</span> already exists as a{" "}
                {match.kind} ({dateLabel}) — matched on <span className="font-medium">{reasonText}</span>.
              </p>
              <div className="rounded-md border bg-muted/40 p-2 text-xs space-y-0.5">
                {match.phone && <div>📞 {formatPhone(match.phone)}</div>}
                {match.email && <div>✉️ {match.email}</div>}
              </div>
              {!isStrong && (
                <p className="text-xs text-muted-foreground">
                  Only the name matches "{attemptedName}". If this is a different person with a similar name, choose Create new.
                </p>
              )}
              {isStrong && !isSameKind && (
                <p className="text-xs text-muted-foreground">
                  The existing record is a <b>{match.kind}</b>, not a {targetKind}. Linking will use that existing record.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={linkPending}>Cancel</AlertDialogCancel>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={linkPending}
            onClick={() => { onCreateAnyway(); }}
          >
            <UserPlus className="w-4 h-4" />
            {createLabel}
          </Button>
          <AlertDialogAction
            className="gap-1.5"
            disabled={linkPending}
            onClick={(e) => { e.preventDefault(); onLinkExisting(match); }}
          >
            <UserCheck className="w-4 h-4" />
            {linkLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
