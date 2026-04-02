import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEventGuests, createEventGuest, deleteEventGuest, convertGuestToCustomer, updateEventGuest } from "@/lib/queries";
import { RSVP_OPTIONS } from "@/lib/types";
import type { EventGuest } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<EventGuest> }) => updateEventGuest(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-guests", eventId] });
    },
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

  const rsvpYes = guests.filter((g) => g.rsvp === "Yes").length;
  const attendingCount = guests.filter((g) => g.attending).length;
  const orderedCount = guests.filter((g) => g.ordered).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Guests ({guests.length})
          </p>
          {guests.length > 0 && (
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              <span>RSVP: {rsvpYes}</span>
              <span>·</span>
              <span>Attended: {attendingCount}</span>
              <span>·</span>
              <span>Ordered: {orderedCount}</span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3 mr-1" />Add Guest
        </Button>
      </div>

      {showForm && (
        <div className="flex gap-2">
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

      {guests.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground py-2">No guests tracked yet</p>
      ) : guests.length > 0 && (
        <div className="border border-border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[10px]">Name</TableHead>
                <TableHead className="text-[10px]">Phone</TableHead>
                <TableHead className="text-[10px] w-20">RSVP</TableHead>
                <TableHead className="text-[10px] text-center w-16">Attended</TableHead>
                <TableHead className="text-[10px] text-center w-16">Ordered</TableHead>
                <TableHead className="text-[10px] text-center w-16">Interested</TableHead>
                <TableHead className="text-[10px] w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.map((g) => (
                <TableRow key={g.id} className="group">
                  <TableCell className="text-xs font-medium py-1.5">
                    <div className="flex items-center gap-1.5">
                      {g.name}
                      {g.converted_customer_id && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-accent text-accent-foreground font-medium">Customer</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground py-1.5">{g.phone || "—"}</TableCell>
                  <TableCell className="py-1.5">
                    <Select
                      value={g.rsvp || "Maybe"}
                      onValueChange={(v) => updateMutation.mutate({ id: g.id, updates: { rsvp: v } })}
                    >
                      <SelectTrigger className="h-6 text-[10px] w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RSVP_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center py-1.5">
                    <Checkbox
                      checked={g.attending}
                      onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { attending: !!v } })}
                    />
                  </TableCell>
                  <TableCell className="text-center py-1.5">
                    <Checkbox
                      checked={g.ordered}
                      onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { ordered: !!v } })}
                    />
                  </TableCell>
                  <TableCell className="text-center py-1.5">
                    <Checkbox
                      checked={g.interested}
                      onCheckedChange={(v) => updateMutation.mutate({ id: g.id, updates: { interested: !!v } })}
                    />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!g.converted_customer_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Convert to customer"
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
                        title="Remove"
                        onClick={() => deleteMutation.mutate(g.id)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
