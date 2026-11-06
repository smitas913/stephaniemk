type GuestIdentity = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  customer_id?: string | null;
  converted_customer_id?: string | null;
  consultant_id?: string | null;
};

export function findDuplicateEventGuest<T extends GuestIdentity>(guests: T[], candidate: GuestIdentity): T | undefined {
  const customerIds = [candidate.customer_id, candidate.converted_customer_id].filter(Boolean);
  const phone = (candidate.phone || "").replace(/\D/g, "");
  const email = (candidate.email || "").trim().toLowerCase();
  const name = (candidate.name || "").trim().toLowerCase();
  return guests.find((guest) =>
    customerIds.some((id) => id === guest.customer_id || id === guest.converted_customer_id) ||
    (!!candidate.consultant_id && candidate.consultant_id === guest.consultant_id) ||
    (phone.length >= 7 && phone === (guest.phone || "").replace(/\D/g, "")) ||
    (!!email && email === (guest.email || "").trim().toLowerCase()) ||
    (!!name && name === (guest.name || "").trim().toLowerCase())
  );
}