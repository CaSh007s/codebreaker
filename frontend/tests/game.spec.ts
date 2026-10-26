import { expect, test, Page } from "@playwright/test";

async function setup(page: Page, name: string) {
  await page.getByPlaceholder("GHOST_STALKER...").fill(name);
  const initialize = page.getByRole("button", { name: "INITIALIZE_LINK" });
  await expect(initialize).toBeEnabled();
  await initialize.click();
  await expect(page.getByText("Uplink_Lobby")).toBeVisible();
}

test("two tabs register, play, chat, refresh, reconnect and rematch", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const sent: string[] = [];
  page.on("websocket", socket => socket.on("framesent", event => sent.push(String(event.payload))));
  const room = `browser-${Date.now()}`;
  await page.goto(`/multiplayer/${room}?mode=standard&level=3&repeats=false`);
  await setup(page, "Alpha");
  const opponent = await context.newPage();
  await opponent.setViewportSize({ width: 360, height: 740 });
  await opponent.goto(`/multiplayer/${room}`);
  await setup(opponent, "Bravo");
  await expect(page.getByText("Bravo", { exact: true })).toBeVisible();
  await Promise.all([
    page.getByRole("button", { name: "READY_TO_DEPLOY" }).click(),
    opponent.getByRole("button", { name: "READY_TO_DEPLOY" }).click(),
  ]);
  await expect(page.getByText("LOCAL_OPERATIVE")).toBeVisible();
  await expect(page.getByText("REMOTE_ENTITY")).toBeVisible();
  await expect(opponent.getByText("LOCAL_OPERATIVE")).toBeVisible();
  expect(sent.filter(frame => frame.includes('"init_room"'))).toHaveLength(1);

  await page.getByRole("button", { name: /GET_HINT/ }).click();
  await expect(page.getByRole("button", { name: /HINT_LIMIT_REACHED/ })).toBeDisabled();
  await page.keyboard.type("000");
  await page.getByRole("button", { name: "SUBMIT", exact: true }).click();
  await expect(page.getByText("01", { exact: true })).toBeVisible();
  const submissions = sent.filter(frame => frame.includes('"submit_guess"')).length;
  await page.getByRole("button", { name: /^\[CHAT\]/ }).click();
  await page.getByPlaceholder("Transmit message...").fill("123");
  await page.getByPlaceholder("Transmit message...").press("Enter");
  await expect(page.getByText("123", { exact: true })).toBeVisible();
  expect(sent.filter(frame => frame.includes('"submit_guess"'))).toHaveLength(submissions);

  await page.reload();
  await expect(page.getByText("LOCAL_OPERATIVE")).toBeVisible();
  await expect(page.getByText("Bravo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /HINT_LIMIT_REACHED/ })).toBeDisabled();
  await expect(page.getByText("01", { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("Connecting");
  await context.setOffline(false);
  await expect(page.getByRole("status")).toBeHidden({ timeout: 15000 });

  await page.getByRole("button", { name: "SURRENDER", exact: true }).click();
  await page.getByRole("button", { name: "CONFIRM_RESIGNATION" }).click();
  await expect(page.getByText("MISSION_ABANDONED", { exact: true })).toBeVisible();
  await expect(opponent.getByText("UPLINK_SECURED_BY_FORFEIT")).toBeVisible();
  await page.getByRole("button", { name: "REQUEST_REMATCH" }).click();
  await opponent.getByRole("button", { name: "ACCEPT_REMATCH" }).click();
  await expect(page.getByText("MISSION_ABANDONED", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: /GET_HINT/ })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("single-player timer ends the game and shows its answer", async ({ page }) => {
  await page.route("**/game/new", route => route.fulfill({ json: { game_id: "timed", code_length: 3, mode: "classic", max_attempts: 25 } }));
  let expirations = 0;
  await page.route("**/game/timed/expire", route => {
    expirations++;
    return route.fulfill({ json: { status: "failed", secret_code: "123" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /SINGLE_PLAYER/ }).click();
  await page.getByRole("button", { name: /STANDARD_LEVELS/ }).click();
  await page.getByRole("button", { name: "2M", exact: true }).click();
  await page.getByRole("button", { name: "DEPLOY_MODULE" }).click();
  await expect(page.getByRole("button", { name: "SUBMIT", exact: true })).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(121_000);
  await expect(page.getByText("TIME_EXPIRED", { exact: true })).toBeVisible();
  await expect(page.getByText("Target Cipher", { exact: true })).toBeVisible();
  expect(expirations).toBe(1);
});

test("score upload failure does not loop and replay uploads the next score", async ({ page }) => {
  let game = 0;
  let uploads = 0;
  await page.route("**/game/new", route => route.fulfill({ json: { game_id: `score-${++game}`, code_length: 3, mode: "classic", max_attempts: 25 } }));
  await page.route("**/game/*/guess", route => route.fulfill({ json: { status: "solved", shuffled_feedback: ["bull", "bull", "bull"], secret_code: "123", attempts_remaining: 24 } }));
  await page.route("**/leaderboard", route => {
    uploads++;
    return route.fulfill({ status: 503, json: { detail: "Unavailable" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /SINGLE_PLAYER/ }).click();
  await page.getByRole("button", { name: /STANDARD_LEVELS/ }).click();
  await page.getByRole("button", { name: "DEPLOY_MODULE" }).click();
  for (let round = 1; round <= 2; round++) {
    await expect(page.getByRole("button", { name: "SUBMIT", exact: true })).toBeVisible();
    await page.keyboard.type("123");
    await page.getByRole("button", { name: "SUBMIT", exact: true }).click();
    await expect(page.getByText("ACCOMPLISHED", { exact: true })).toBeVisible();
    await expect.poll(() => uploads).toBe(round);
    if (round === 1) await page.getByRole("button", { name: "Replay Level" }).click();
  }
});

test("six-digit game fits a narrow mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/game/new", route => route.fulfill({ json: { game_id: "mobile", code_length: 6, mode: "classic", max_attempts: 10 } }));
  await page.goto("/");
  await page.getByRole("button", { name: /SINGLE_PLAYER/ }).click();
  await page.getByRole("button", { name: /STANDARD_LEVELS/ }).click();
  await page.getByRole("button", { name: /HARD/ }).click();
  await page.getByRole("button", { name: "DEPLOY_MODULE" }).click();
  await expect(page.getByRole("button", { name: "SUBMIT", exact: true })).toBeVisible();
  const board = page.getByRole("region", { name: "Guess board" });
  await expect(board).toBeVisible();
  expect(await board.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.type("123456");
  await expect(page.getByRole("button", { name: "SUBMIT", exact: true })).toBeEnabled();
});

test("single-player completes a real API guess, hint and surrender flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /SINGLE_PLAYER/ }).click();
  await page.getByRole("button", { name: /STANDARD_LEVELS/ }).click();
  await page.getByRole("button", { name: "DEPLOY_MODULE" }).click();
  await expect(page.getByRole("button", { name: "SUBMIT", exact: true })).toBeVisible();
  // Standard rookie codes have unique digits, so 000 cannot accidentally win.
  await page.keyboard.type("000");
  await page.getByRole("button", { name: "SUBMIT", exact: true }).click();
  await expect(page.getByText("24", { exact: true })).toBeVisible();
  const hintResponse = page.waitForResponse(response => response.url().endsWith("/hint"));
  await page.getByRole("button", { name: "[GET_HINT]", exact: true }).click();
  expect((await hintResponse).status()).toBe(200);
  await page.getByRole("button", { name: "[SURRENDER]", exact: true }).click();
  await expect(page.getByText("MISSION_FAILED", { exact: true })).toBeVisible();
  await expect(page.getByText("Target Cipher", { exact: true })).toBeVisible();
});
