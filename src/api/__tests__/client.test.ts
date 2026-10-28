import { ApiError, apiFetch, configureClient, fieldErrors } from "../client";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock;
});

test("sends the bearer token and the mobile client header, never cookies", async () => {
  configureClient({ token: "t0k" });
  fetchMock.mockReturnValue(json(200, { ok: true }));
  await apiFetch("/auth/me");
  const [, init] = fetchMock.mock.calls[0];
  expect(init.headers.get("authorization")).toBe("Bearer t0k");
  expect(init.headers.get("x-client")).toBe("mobile");
  expect(init.credentials).toBe("omit");
});

test("no token, no authorization header", async () => {
  configureClient({ token: null });
  fetchMock.mockReturnValue(json(200, {}));
  await apiFetch("/health");
  expect(fetchMock.mock.calls[0][1].headers.has("authorization")).toBe(false);
});

test("401 signs out, except on credential endpoints", async () => {
  const onUnauthorized = jest.fn();
  configureClient({ token: "x", onUnauthorized });
  const unauth = { error: { code: "UNAUTHENTICATED", message: "Your session has expired" } };

  fetchMock.mockReturnValue(json(401, unauth));
  await expect(apiFetch("/auth/token", { method: "POST" })).rejects.toThrow("Your session has expired");
  expect(onUnauthorized).not.toHaveBeenCalled();

  fetchMock.mockReturnValue(json(401, unauth));
  await expect(apiFetch("/projects")).rejects.toBeInstanceOf(ApiError);
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});

test("network failure becomes a friendly NETWORK error", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(apiFetch("/projects")).rejects.toMatchObject({ status: 0, code: "NETWORK" });
});

test("fieldErrors keys 422 details by field name", () => {
  const err = new ApiError(422, "VALIDATION_ERROR", "Invalid", [
    { loc: ["body", "password"], msg: "Value error, Too short" },
  ]);
  expect(fieldErrors(err)).toEqual({ password: "Too short" });
  expect(fieldErrors(new Error("x"))).toEqual({});
});
