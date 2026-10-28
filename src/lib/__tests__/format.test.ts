import { cleanMessage, relativeTime } from "../format";

test("relativeTime", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  expect(relativeTime("2026-10-28T11:59:30Z", now)).toBe("just now");
  expect(relativeTime("2026-10-28T11:55:00Z", now)).toBe("5m ago");
  expect(relativeTime("2026-10-25T12:00:00Z", now)).toBe("3d ago");
  // Clock skew: a timestamp slightly in the future is still "just now".
  expect(relativeTime("2026-10-28T12:00:20Z", now)).toBe("just now");
});

test("cleanMessage hides provider and model names", () => {
  expect(cleanMessage("Draft ready (groq/llama-3.3-70b)")).toBe("Draft ready");
  expect(cleanMessage("Model provider returned HTTP 429")).toBe("The AI service is busy (rate limit reached)");
});
