import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const stored = await hashPassword("1234567890");
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(stored).not.toContain("1234567890");
    expect(await verifyPassword("1234567890", stored)).toBe(true);
    expect(await verifyPassword("123456789", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
    expect(await verifyPassword("1234567890", "garbage")).toBe(false);
  });
});
