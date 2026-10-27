import assert from "node:assert/strict";
import worker from "../src/index.js";

const health = await worker.fetch(new Request("https://example.workers.dev/health"), {});
assert.equal(health.status, 200);
assert.equal(await health.text(), "ok");

const unauthorizedWebhook = await worker.fetch(
  new Request("https://example.workers.dev/telegram", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ update_id: 1 }),
  }),
  { WEBHOOK_SECRET: "expected-secret" }
);
assert.equal(unauthorizedWebhook.status, 401);

const unauthorizedSetup = await worker.fetch(
  new Request("https://example.workers.dev/register-webhook", { method: "POST" }),
  { REGISTER_SECRET: "expected-register-secret" }
);
assert.equal(unauthorizedSetup.status, 401);

console.log("Smoke tests passed.");
