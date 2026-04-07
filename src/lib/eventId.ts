export function generateEventId(
  orderType: string,
  orderDate: string,
  customerName: string,
  existingEventIds: string[]
): string {
  const prefix = orderType === "Reorder" ? "R" : orderType === "Networking Event" ? "N" : orderType === "Vendor Event" ? "V" : "E";
  const [year, month, day] = orderDate.split("-");

  // Customer code: first initial + up to 7 chars of last name
  const parts = customerName.trim().split(/\s+/).filter(Boolean);
  let code = "";
  if (parts.length >= 2) {
    const first = parts[0][0].toUpperCase();
    const last = parts[parts.length - 1].replace(/[^a-zA-Z]/g, "");
    code = first + last.charAt(0).toUpperCase() + last.slice(1, 7).toLowerCase();
  } else if (parts.length === 1) {
    const single = parts[0].replace(/[^a-zA-Z]/g, "");
    code = single.charAt(0).toUpperCase() + single.slice(1, 8).toLowerCase();
  } else {
    code = "Unknown";
  }

  const base = `${prefix}-${parseInt(year)}-${parseInt(month)}-${parseInt(day)}-${code}`;

  if (!existingEventIds.includes(base)) return base;
  let suffix = 2;
  while (existingEventIds.includes(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}
