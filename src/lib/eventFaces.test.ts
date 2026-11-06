import { describe, it, expect } from "vitest";
import { attendingFacesByEvent, eventFaces } from "./eventFaces";

describe("eventFaces", () => {
  it("counts an attending guest when guest_count is 0 (Olya case)", () => {
    const m = attendingFacesByEvent([{ event_id: "F1", attending: true, name: "Olya Schaefer", phone: "7273000967" }]);
    expect(eventFaces({ event_id: "F1", guest_count: 0 }, m)).toBe(1);
  });
  it("counts the same person on two rows once (linked + manual)", () => {
    const m = attendingFacesByEvent([
      { event_id: "F1", attending: true, name: "Olya Schaefer", converted_customer_id: "c1" },
      { event_id: "F1", attending: true, name: "olya  schaefer", phone: "(727) 300-0967" },
    ]);
    expect(m.get("F1")).toBe(1);
  });
  it("ignores non-attending guests and falls back to guest_count", () => {
    const m = attendingFacesByEvent([{ event_id: "F1", attending: false, name: "A" }]);
    expect(eventFaces({ event_id: "F1", guest_count: 4 }, m)).toBe(4);
  });
});
