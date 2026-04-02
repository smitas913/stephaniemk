import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEventGuests, createEventGuest, deleteEventGuest, convertGuestToCustomer } from "@/lib/queries";
import type { EventGuest } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Trash2, ArrowRightLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface Props {
  eventId: string;
}

export default function EventGuestPanel({ eventId }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const { data: guests = [] } = useQuery({
    queryKey: ["event-guests", eventId],
    queryFn: () => fetchEventGuests(eventId),
  });

  const addMutation = useMutation({
    mutationFn: createEventGuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
      setName("");
      setPhone("");
      setShowForm(false);
      toast.success("Guest added");
    },
    onError: (err: any) => toast.error(err.message || "Failed to add guest"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEventGuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
      toast.success("Guest removed");
    },
  });

  const convertMutation = useMutation({
    mutationFn: convertGuestToCustomer,
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`${customer.full_name} added as customer`);
      navigate(`/orders/new?customer=${customer.id}`);
    },
    onError: (err: any) => toast.error(err.message || "Failed to convert"),
  });

  const handleAdd = () => {
    if (!name.trim()) return;
    addMutation.mutate({ event_id: eventId, name: name.trim(), phone: phone.trim() || null });
  };

  return (
    <div className="pl-10 pr-4 py-2 bg-muted/10 border-t border-border/30">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Non-ordering Guests ({guests.length})
        </p>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3 mr-1" />Add Guest
        </Button>
      </div>

      {showForm && (
        <div className="flex gap-2 mb-2">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 text-xs flex-1"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Input
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-7 text-xs w-32"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={addMutation.isPending}>
            Add
          </Button>
        </div>
      )}

      {guests.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground py-1">No guests tracked yet</p>
      )}

      {guests.map((g) => (
        <div key={g.id} className="flex items-center justify-between py-1 group">
          <div className="flex items-center gap-2">
            <UserPlus className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-medium">{g.name}</span>
            {g.phone && <span className="text-xs text-muted-foreground">{g.phone}</span>}
            {g.converted_customer_id && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Converted</span>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!g.converted_customer_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Convert to customer & create order"
                onClick={() => convertMutation.mutate(g)}
                disabled={convertMutation.isPending}
              >
                <ArrowRightLeft className="w-3 h-3 text-primary" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Remove guest"
              onClick={() => deleteMutation.mutate(g.id)}
            >
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
