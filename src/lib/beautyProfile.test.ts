import { describe, it, expect } from "vitest";
import { mergeBeautyProfileForSave, parseBeautyProfile, derivedSkinType } from "./beautyProfile";

describe("simplified beauty profile", () => {
  const legacy = { age_range: "40s–50s", general: "loves pink", foundation_shade: "Beige 3", skin_concerns: ["Acne"] };

  it("keeps legacy keys and stamps profile_updated_at on save", () => {
    const out = mergeBeautyProfileForSave(legacy, { skin_type: "Dry", skin_concerns: ["Wrinkles"] }, "2026-11-06");
    expect(out.age_range).toBe("40s–50s");
    expect(out.general).toBe("loves pink");
    expect(out.skin_concerns).toEqual(["Wrinkles"]);
    expect(out.profile_updated_at).toBe("2026-11-06");
  });

  it("latest answers overwrite; cleared fields are removed", () => {
    const out = mergeBeautyProfileForSave(legacy, { foundation_shade: "" }, "2026-11-06");
    expect(out.foundation_shade).toBeUndefined();
  });

  it("parses old data without crashing and ignores legacy-only keys", () => {
    expect(parseBeautyProfile(legacy)).toEqual({ foundation_shade: "Beige 3", skin_concerns: ["Acne"] });
    expect(parseBeautyProfile(null)).toEqual({});
  });

  it("maps skin type for the facial contacts column", () => {
    expect(derivedSkinType({ skin_type: "Oily" })).toBe("Combination to Oily");
    expect(derivedSkinType({ skin_type: "Normal" })).toBe("Normal to Dry");
    expect(derivedSkinType({ skin_type: "Dry" })).toBe("Normal to Dry");
  });
});
