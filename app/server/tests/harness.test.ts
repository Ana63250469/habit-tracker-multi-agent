import { describe, it, expect, beforeEach } from "vitest";
import { api, auth, resetDb, createHabit } from "./support/helpers";

// Smoke test for the test infrastructure itself (not for any feature).
describe("test harness", () => {
  beforeEach(resetDb);

  it("health endpoint works", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
  });

  it("authenticated requests and helpers work", async () => {
    await createHabit("Run");
    const res = await api().get("/api/habits").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.map((h: { name: string }) => h.name)).toEqual(["Run"]);
  });
});
