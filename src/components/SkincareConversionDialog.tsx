import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRef } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user picks Yes (new conversion) or No (already a skincare customer). */
  onChoose: (isNewConversion: boolean) => void;
  /** Called when user dismisses without choosing — caller should revert checkbox to off. */
  onCancel: () => void;
}

export default function SkincareConversionDialog({ open, onOpenChange, onChoose, onCancel }: Props) {
  // Track whether a choice was made so closing the dialog doesn't trigger cancel.
  const decidedRef = useRef(false);

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      if (!decidedRef.current) onCancel();
      decidedRef.current = false;
    }
    onOpenChange(o);
  };

  const choose = (isNew: boolean) => {
    decidedRef.current = true;
    onChoose(isNew);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Is this a new skincare conversion?</DialogTitle>
          <DialogDescription>
            Dashboard tracking only counts brand-new skincare conversions. Let us know whether this person is just now starting skincare.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col sm:space-x-0 gap-2">
          <Button type="button" className="w-full" onClick={() => choose(true)}>
            Yes, new conversion
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => choose(false)}>
            No, already a skincare customer
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              decidedRef.current = false;
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
