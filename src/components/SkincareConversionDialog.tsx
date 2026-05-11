import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user picks Yes (new conversion) or No (already a skincare customer). */
  onChoose: (isNewConversion: boolean) => void;
  /** Called when user dismisses without choosing — caller should revert checkbox to off. */
  onCancel: () => void;
}

export default function SkincareConversionDialog({ open, onOpenChange, onChoose, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Is this a new skincare conversion?</DialogTitle>
          <DialogDescription>
            We track new skincare conversions on your dashboard. Let us know whether this person is just now starting skincare.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col sm:space-x-0 gap-2">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              onChoose(true);
              onOpenChange(false);
            }}
          >
            Yes, new conversion
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              onChoose(false);
              onOpenChange(false);
            }}
          >
            No, already a skincare customer
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              onCancel();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
