import { describe, it, expect } from "vitest";
import { readImportBody } from "@/server/imports/http";
import { getServerEnv } from "@/server/env";
import { assertDemoSeedAllowed } from "@/server/services/employee-demo";
function request(body: FormData, origin = getServerEnv().BETTER_AUTH_URL) {
  return new Request("http://localhost/api/employees/import/preview", {
    method: "POST",
    headers: { origin },
    body,
  });
}
function form() {
  const body = new FormData();
  body.set(
    "file",
    new File(["email;prenom;nom\na@example.invalid;A;B"], "test.csv"),
  );
  body.set("metadata", "{}");
  return body;
}
describe("in-memory import transport", () => {
  it("reads a bounded multipart file entirely in memory", async () =>
    expect(
      (await readImportBody(request(form()))).bytes.length,
    ).toBeGreaterThan(0));
  it("rejects a foreign origin", async () =>
    await expect(
      readImportBody(request(form(), "https://foreign.invalid")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" }));
  it("rejects duplicate file fields", async () => {
    const data = form();
    data.append("file", new File(["x"], "other.csv"));
    await expect(readImportBody(request(data))).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });
  it("rejects oversized file and metadata separately", async () => {
    const data = form();
    data.set(
      "file",
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.csv"),
    );
    await expect(readImportBody(request(data))).rejects.toMatchObject({
      code: "IMPORT_TOO_LARGE",
    });
    const huge = form();
    huge.set("metadata", "x".repeat(64 * 1024 + 1));
    await expect(readImportBody(request(huge))).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });
  it("bounds chunked input without trusting Content-Length", async () => {
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < 4; i++)
          controller.enqueue(new Uint8Array(1024 * 1024));
        controller.close();
      },
    });
    const req = new Request("http://localhost/api/employees/import/preview", {
      method: "POST",
      duplex: "half",
      body: stream,
      headers: {
        origin: getServerEnv().BETTER_AUTH_URL,
        "content-type": "multipart/form-data; boundary=test",
      },
    } as RequestInit);
    await expect(readImportBody(req)).rejects.toMatchObject({
      code: "IMPORT_TOO_LARGE",
    });
  });
});
it.each([undefined, false, true, "false", "TRUE", " true", "true "])(
  "refuses demo seed guard %s",
  (value) =>
    expect(() => assertDemoSeedAllowed(value)).toThrow("DEMO_SEED_NOT_ALLOWED"),
);
it("accepts only the literal demo authorization", () =>
  expect(() => assertDemoSeedAllowed("true")).not.toThrow());
