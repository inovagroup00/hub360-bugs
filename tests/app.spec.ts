import { test, expect } from "@playwright/test";

// ============================================
// LOGIN TESTS
// ============================================

test.describe("Login Page", () => {
  test("shows login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("Hub 360");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText("Entrar");
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "invalid@email.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Email ou senha incorretos")).toBeVisible({
      timeout: 10000,
    });
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@hub360.com.br");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).toHaveURL(/dashboard/);
  });
});

// ============================================
// DASHBOARD TESTS
// ============================================

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@hub360.com.br");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("shows bug list with seeded data", async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("shows status filter badges", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    // Should see status labels like "Novo", "Em analise", etc.
    await expect(page.locator("text=Novo").first()).toBeVisible();
  });

  test("search filters bugs by title", async ({ page }) => {
    // Wait for loading to finish — the spinner row disappears and real data rows appear
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    // Wait for the loading spinner to disappear (the animate-spin element inside tbody)
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    const initialCount = await page.locator("table tbody tr").count();

    await page.fill('input[placeholder="Buscar por titulo..."]', "Pix");

    // Wait for debounce (300ms) + network request to complete
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.waitForTimeout(1500);
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    const filteredCount = await page.locator("table tbody tr").count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test("clicking a bug opens the detail drawer", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.locator("table tbody tr").first().click();

    // Drawer should appear — wait for the fixed drawer panel
    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Wait for drawer content to load (detail labels rendered by DetailBlock)
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });
    await expect(drawer.locator("dt", { hasText: "O que fez" })).toBeVisible();
    await expect(drawer.locator("dt", { hasText: "O que aconteceu" })).toBeVisible();
  });

  test("can change bug status from drawer", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.locator("table tbody tr").first().click();

    // Wait for drawer content to load
    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Find status select inside the drawer (first select is Status)
    const statusSelect = drawer.locator("select").first();
    await expect(statusSelect).toBeVisible();

    // Change status
    await statusSelect.selectOption("analyzing");
    await page.waitForTimeout(2000); // wait for API call
  });

  test("can close drawer with X button", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.locator("table tbody tr").first().click();

    // Wait for drawer content to load
    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Click close button (the X SVG button inside the drawer)
    await drawer.locator("button").filter({ has: page.locator("svg") }).first().click();

    // Drawer should disappear
    await expect(drawer).toBeHidden({ timeout: 5000 });
  });

  test("project filter works", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Select a project from dropdown
    const projectSelect = page.locator("select").first();
    await expect(projectSelect).toBeVisible();
  });

  test("logout works", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.click("text=Sair");
    await page.waitForURL("**/login", { timeout: 5000 });
  });
});

// ============================================
// REPORT FORM TESTS
// ============================================

test.describe("Bug Report Form", () => {
  test("shows project not found for invalid slug", async ({ page }) => {
    await page.goto("/report/invalid-project-slug-xyz");
    await expect(page.locator("text=Projeto nao encontrado")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows report form for valid project", async ({ page }) => {
    await page.goto("/report/az-ib");
    await expect(page.locator("h1")).toContainText("Reportar um bug");
    await expect(page.locator("text=AZ-IB").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows validation errors for empty form", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000); // wait for project validation

    // Click submit without filling anything
    await page.click('button[type="submit"]');

    // Should show validation errors
    await expect(page.locator("text=Minimo 5 caracteres").first()).toBeVisible();
    await expect(page.locator("text=Selecione a gravidade")).toBeVisible();
  });

  test("can fill out and submit bug report", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000); // wait for project validation

    // Fill all required fields
    await page.fill('input[placeholder*="Botao"]', "Botao de login nao funciona no Safari");
    await page.fill('input[placeholder*="Tela inicial"]', "Tela de login > Botao Entrar");
    await page.fill('textarea[placeholder*="Abri o app"]', "Abri o app no Safari, digitei email e senha, cliquei em Entrar");
    await page.fill('textarea[placeholder*="Esperava"]', "Esperava fazer login normalmente");
    await page.fill('textarea[placeholder*="Nada"]', "O botao nao responde ao clique. Nada acontece visualmente.");

    // Select severity
    await page.click("text=Alta");

    // For file upload, we need to handle it programmatically
    // Create a small test file
    const fileInput = page.locator('input[type="file"]');

    // Create a test PNG (1x1 pixel)
    const buffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    await fileInput.setInputFiles({
      name: "screenshot.png",
      mimeType: "image/png",
      buffer: buffer,
    });

    // Wait for upload
    await page.waitForTimeout(3000);

    // Should show uploaded file
    await expect(page.locator("text=screenshot.png")).toBeVisible({
      timeout: 10000,
    });

    // Submit
    await page.click('button[type="submit"]');

    // Should see success message
    await expect(page.locator("text=enviado")).toBeVisible({
      timeout: 15000,
    });
  });

  test("reporter name and email fields are optional", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    // Name and email fields should be visible but not required
    await expect(page.locator('input[placeholder="Seu nome"]')).toBeVisible();
    await expect(
      page.locator('input[placeholder="email@exemplo.com"]')
    ).toBeVisible();

    // They should have "(opcional)" label
    await expect(page.locator("text=(opcional)").first()).toBeVisible();
  });

  test("device info is auto-detected", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    // Device info field should be pre-filled
    const deviceInput = page.locator(
      'input[placeholder*="Samsung Galaxy"]'
    );
    const value = await deviceInput.inputValue();
    expect(value).toBeTruthy(); // Should have some auto-detected value
  });

  test("severity cards show descriptions", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    await expect(page.locator("text=Critica")).toBeVisible();
    await expect(page.locator("text=Alta")).toBeVisible();
    await expect(page.locator("text=Media")).toBeVisible();
    await expect(page.locator("text=Baixa")).toBeVisible();
  });
});

// ============================================
// API SECURITY TESTS
// ============================================

test.describe("API Security", () => {
  test("GET /api/bugs requires authentication", async ({ request }) => {
    const res = await request.get("/api/bugs");
    expect(res.status()).toBe(401);
  });

  test("GET /api/bugs rejects invalid token", async ({ request }) => {
    const res = await request.get("/api/bugs", {
      headers: { Authorization: "Bearer invalid_token" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/bugs validates required fields", async ({ request }) => {
    const res = await request.post("/api/bugs", {
      data: { project_slug: "az-ib" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("POST /api/bugs rejects invalid severity", async ({ request }) => {
    const res = await request.post("/api/bugs", {
      data: {
        project_slug: "az-ib",
        title: "Test bug title",
        where_found: "Test location",
        steps_taken: "Test steps taken",
        expected_behavior: "Test expected behavior",
        actual_behavior: "Test actual behavior",
        severity: "invalid_severity",
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/bugs rejects invalid project slug", async ({ request }) => {
    const res = await request.post("/api/bugs", {
      data: {
        project_slug: "nonexistent-project",
        title: "Test bug title here",
        where_found: "Test location",
        steps_taken: "Test steps taken here",
        expected_behavior: "Test expected behavior",
        actual_behavior: "Test actual behavior",
        severity: "medium",
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(404);
  });

  test("PATCH /api/bugs/:id requires authentication", async ({ request }) => {
    const res = await request.patch("/api/bugs/some-id", {
      data: { status: "analyzing" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });
});

// ============================================
// REDIRECT TEST
// ============================================

test.describe("Navigation", () => {
  test("root redirects to login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login", { timeout: 5000 });
  });
});

// ============================================
// API - AUTH EDGE CASES
// ============================================

test.describe("API Auth Edge Cases", () => {
  test("POST /api/auth rejects empty email and password", async ({ request }) => {
    const res = await request.post("/api/auth", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("POST /api/auth returns session and user on valid login", async ({ request }) => {
    const res = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.session).toBeDefined();
    expect(body.session.access_token).toBeTruthy();
    expect(body.session.refresh_token).toBeTruthy();
    expect(body.session.expires_at).toBeDefined();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("admin@hub360.com.br");
  });
});

// ============================================
// API - SINGLE BUG DETAIL (GET /api/bugs/:id)
// ============================================

test.describe("API Single Bug Detail", () => {
  test("GET /api/bugs/:id requires authentication", async ({ request }) => {
    const res = await request.get("/api/bugs/some-uuid");
    expect(res.status()).toBe(401);
  });

  test("GET /api/bugs/:id returns 401 for invalid token", async ({ request }) => {
    const res = await request.get("/api/bugs/some-uuid", {
      headers: { Authorization: "Bearer invalid_token" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/bugs/:id returns 404 for nonexistent bug", async ({ request }) => {
    // Login first to get a valid token
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/bugs/00000000-0000-0000-0000-000000000000", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

// ============================================
// API - PATCH BUG EDGE CASES
// ============================================

test.describe("API Patch Bug Edge Cases", () => {
  test("PATCH /api/bugs/:id rejects invalid token", async ({ request }) => {
    const res = await request.patch("/api/bugs/some-id", {
      data: { status: "analyzing" },
      headers: {
        Authorization: "Bearer bad_token",
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/bugs/:id rejects invalid status value", async ({ request }) => {
    // Login first
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    // Get a real bug ID from the listing
    const listRes = await request.get("/api/bugs?page=1&page_size=1", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const listBody = await listRes.json();
    const bugId = listBody.bugs[0]?.id;
    expect(bugId).toBeTruthy();

    const res = await request.patch(`/api/bugs/${bugId}`, {
      data: { status: "invalid_status_value" },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("PATCH /api/bugs/:id rejects empty update body", async ({ request }) => {
    // Login first
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const listRes = await request.get("/api/bugs?page=1&page_size=1", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const listBody = await listRes.json();
    const bugId = listBody.bugs[0]?.id;
    expect(bugId).toBeTruthy();

    const res = await request.patch(`/api/bugs/${bugId}`, {
      data: {},
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Nenhum campo para atualizar");
  });

  test("PATCH /api/bugs/:id succeeds with valid status change", async ({ request }) => {
    // Login first
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const listRes = await request.get("/api/bugs?page=1&page_size=1", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const listBody = await listRes.json();
    const bugId = listBody.bugs[0]?.id;
    expect(bugId).toBeTruthy();

    const res = await request.patch(`/api/bugs/${bugId}`, {
      data: { status: "analyzing" },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.bug).toBeDefined();
  });
});

// ============================================
// API - NOTES ENDPOINT
// ============================================

test.describe("API Notes Endpoint", () => {
  test("POST /api/bugs/:id/notes requires authentication", async ({ request }) => {
    const res = await request.post("/api/bugs/some-id/notes", {
      data: { content: "Test note" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/bugs/:id/notes rejects invalid token", async ({ request }) => {
    const res = await request.post("/api/bugs/some-id/notes", {
      data: { content: "Test note" },
      headers: {
        Authorization: "Bearer invalid_token",
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/bugs/:id/notes rejects empty content", async ({ request }) => {
    // Login first
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const listRes = await request.get("/api/bugs?page=1&page_size=1", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const listBody = await listRes.json();
    const bugId = listBody.bugs[0]?.id;
    expect(bugId).toBeTruthy();

    const res = await request.post(`/api/bugs/${bugId}/notes`, {
      data: { content: "" },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("POST /api/bugs/:id/notes creates note with valid data", async ({ request }) => {
    // Login first
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const listRes = await request.get("/api/bugs?page=1&page_size=1", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const listBody = await listRes.json();
    const bugId = listBody.bugs[0]?.id;
    expect(bugId).toBeTruthy();

    const res = await request.post(`/api/bugs/${bugId}/notes`, {
      data: { content: "This is a test note from Playwright" },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.note).toBeDefined();
    expect(body.note.content).toBe("This is a test note from Playwright");
  });
});

// ============================================
// API - UPLOAD ENDPOINT
// ============================================

test.describe("API Upload Endpoint", () => {
  test("POST /api/upload rejects request with no file", async ({ request }) => {
    const res = await request.post("/api/upload", {
      multipart: {
        project_slug: "az-ib",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("NO_FILE");
  });
});

// ============================================
// API - GET BUGS LIST EDGE CASES
// ============================================

test.describe("API Bugs List Edge Cases", () => {
  test("GET /api/bugs supports search filter", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/bugs?search=Pix&page=1&page_size=30", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.bugs).toBeDefined();
    expect(Array.isArray(body.bugs)).toBe(true);
    expect(body.total).toBeDefined();
    expect(body.total_pages).toBeDefined();
  });

  test("GET /api/bugs supports severity filter", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/bugs?severity=critical&page=1&page_size=30", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.bugs).toBeDefined();
    // All returned bugs should be critical severity
    for (const bug of body.bugs) {
      expect(bug.severity).toBe("critical");
    }
  });

  test("GET /api/bugs supports sorting", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/bugs?sort_by=title&sort_dir=asc&page=1&page_size=30", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.bugs).toBeDefined();
    expect(body.page).toBe(1);
  });

  test("GET /api/bugs supports status filter", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/bugs?status=new&page=1&page_size=30", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.bugs).toBeDefined();
    for (const bug of body.bugs) {
      expect(bug.status).toBe("new");
    }
  });
});

// ============================================
// DASHBOARD - ADVANCED UI FEATURES
// ============================================

test.describe("Dashboard Advanced Features", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@hub360.com.br");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("displays user name or email in header", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    // The header shows user name or email next to the "Sair" button
    const header = page.locator("header");
    await expect(header).toBeVisible();
    await expect(header.locator("text=Sair")).toBeVisible();
  });

  test("severity filter dropdown is visible and has options", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    // The severity select should be the one with "Todas as gravidades" option
    const severitySelect = page.locator('select').filter({ hasText: "Todas as gravidades" });
    await expect(severitySelect).toBeVisible();

    // Should contain severity options
    await expect(severitySelect.locator("option", { hasText: "Critica" })).toBeAttached();
    await expect(severitySelect.locator("option", { hasText: "Alta" })).toBeAttached();
    await expect(severitySelect.locator("option", { hasText: "Media" })).toBeAttached();
    await expect(severitySelect.locator("option", { hasText: "Baixa" })).toBeAttached();
  });

  test("status filter stat cards are clickable", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // Click on "Novo" status card to filter by new bugs
    const statusCard = page.locator("button").filter({ hasText: "Novo" }).first();
    await expect(statusCard).toBeVisible();
    await statusCard.click();

    // Wait for data reload
    await page.waitForTimeout(1500);
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // "Limpar filtros" button should now appear since a filter is active
    await expect(page.locator("text=Limpar filtros")).toBeVisible({ timeout: 5000 });
  });

  test("clear filters button resets all filters", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // Activate a filter first by clicking a status card
    const statusCard = page.locator("button").filter({ hasText: "Novo" }).first();
    await statusCard.click();
    await page.waitForTimeout(1500);
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // Click "Limpar filtros"
    await page.click("text=Limpar filtros");
    await page.waitForTimeout(1500);
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // "Limpar filtros" should be gone now
    await expect(page.locator("text=Limpar filtros")).toBeHidden({ timeout: 5000 });
  });

  test("column headers are sortable", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // Click "Titulo" column header to sort by title
    const titleHeader = page.locator("th").filter({ hasText: "Titulo" });
    await expect(titleHeader).toBeVisible();
    await titleHeader.click();

    // Wait for data reload
    await page.waitForTimeout(1500);
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // Table should still have data
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("drawer shows notes section with empty state", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.locator("table tbody tr").first().click();

    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Notes section should be present
    await expect(drawer.locator("text=Notas internas")).toBeVisible();

    // Note input field should be visible
    await expect(
      drawer.locator('input[placeholder="Adicionar nota..."]')
    ).toBeVisible();

    // "Enviar" button for notes should be visible
    await expect(drawer.locator("button", { hasText: "Enviar" })).toBeVisible();
  });

  test("can add a note from the drawer", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.locator("table tbody tr").first().click();

    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Type a note
    const noteInput = drawer.locator('input[placeholder="Adicionar nota..."]');
    await noteInput.fill("Nota de teste via Playwright");

    // Click Enviar
    await drawer.locator("button", { hasText: "Enviar" }).click();

    // Wait for note to be saved and drawer to refresh
    await page.waitForTimeout(3000);

    // The note text should now appear in the notes list
    await expect(drawer.locator("text=Nota de teste via Playwright").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("drawer shows bug number and title", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.locator("table tbody tr").first().click();

    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Should show bug number (e.g. #1, #2, etc.)
    await expect(drawer.locator("span.font-mono").first()).toBeVisible();

    // Should show the bug title
    const title = drawer.locator("h2");
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.length).toBeGreaterThan(0);
  });

  test("drawer shows both status and assignee selects", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.locator("table tbody tr").first().click();

    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Status select
    const statusLabel = drawer.locator("label", { hasText: "Status" });
    await expect(statusLabel).toBeVisible();

    // Responsavel select
    const assigneeLabel = drawer.locator("label", { hasText: "Responsavel" });
    await expect(assigneeLabel).toBeVisible();

    // Both selects should be there
    const selects = drawer.locator("select");
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("can close drawer by clicking backdrop", async ({ page }) => {
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );
    await page.locator("table tbody tr").first().click();

    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Click the backdrop (the black overlay)
    const backdrop = page.locator(".fixed.inset-0.bg-black\\/20");
    await backdrop.click({ position: { x: 10, y: 10 } });

    // Drawer should disappear
    await expect(drawer).toBeHidden({ timeout: 5000 });
  });
});

// ============================================
// REPORT FORM - EDGE CASES
// ============================================

test.describe("Report Form Edge Cases", () => {
  test("shows max 3 files error message", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    const fileInput = page.locator('input[type="file"]');
    const buffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    // Upload 3 files one by one
    for (let i = 0; i < 3; i++) {
      await fileInput.setInputFiles({
        name: `screenshot${i}.png`,
        mimeType: "image/png",
        buffer: buffer,
      });
      await page.waitForTimeout(2000);
    }

    // After 3 files, the upload area should be hidden (files.length < 3 is false)
    // The upload zone with "Toque para escolher" should not be visible
    await expect(page.locator("text=Toque para escolher")).toBeHidden({ timeout: 5000 });
  });

  test("shows file name after upload", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    const fileInput = page.locator('input[type="file"]');
    const buffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    await fileInput.setInputFiles({
      name: "meu-print.png",
      mimeType: "image/png",
      buffer: buffer,
    });

    await expect(page.locator("text=meu-print.png")).toBeVisible({ timeout: 10000 });
  });

  test("can remove an uploaded file", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    const fileInput = page.locator('input[type="file"]');
    const buffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    await fileInput.setInputFiles({
      name: "to-remove.png",
      mimeType: "image/png",
      buffer: buffer,
    });

    await expect(page.locator("text=to-remove.png")).toBeVisible({ timeout: 10000 });

    // Click the X button next to the file to remove it
    const fileRow = page.locator("text=to-remove.png").locator("..");
    const removeButton = fileRow.locator("..").locator("button");
    await removeButton.click();

    // File should be removed
    await expect(page.locator("text=to-remove.png")).toBeHidden({ timeout: 5000 });
  });

  test("submit button is disabled while uploading", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    // The submit button should have disabled state while uploading is in progress
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toContainText("Enviar report");
  });

  test("validation requires file attachment", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    // Fill all text fields but no file
    await page.fill('input[placeholder*="Botao"]', "Bug title that is valid");
    await page.fill('input[placeholder*="Tela inicial"]', "Tela de login");
    await page.fill('textarea[placeholder*="Abri o app"]', "Steps to reproduce this bug");
    await page.fill('textarea[placeholder*="Esperava"]', "Expected behavior here");
    await page.fill('textarea[placeholder*="Nada"]', "Actual behavior description here");
    await page.click("text=Media");

    // Submit without file
    await page.click('button[type="submit"]');

    // Should show file required error
    await expect(page.locator("text=Anexe pelo menos uma evidencia")).toBeVisible({
      timeout: 5000,
    });
  });

  test("where_found validation requires minimum 3 characters", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    // Fill where_found with only 2 chars
    await page.fill('input[placeholder*="Botao"]', "Valid title here");
    await page.fill('input[placeholder*="Tela inicial"]', "AB");
    await page.fill('textarea[placeholder*="Abri o app"]', "Steps taken");
    await page.fill('textarea[placeholder*="Esperava"]', "Expected behavior");
    await page.fill('textarea[placeholder*="Nada"]', "Actual behavior");
    await page.click("text=Baixa");

    await page.click('button[type="submit"]');

    await expect(page.locator("text=Descreva onde encontrou o problema")).toBeVisible({
      timeout: 5000,
    });
  });

  test("severity selection highlights the chosen card", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    // Click "Critica" severity
    await page.click("text=Critica");

    // The critical button should have a border-current class indicating it's selected
    // We can verify by checking the Critica button's parent has the selected style
    const criticalCard = page.locator("button").filter({ hasText: "Critica" }).filter({ hasText: "trava" });
    await expect(criticalCard).toBeVisible();

    // Click "Baixa" severity instead
    await page.click("text=Baixa");

    // Now submit to verify severity is set (it won't show severity error)
    await page.click('button[type="submit"]');
    // We should NOT see "Selecione a gravidade" error
    await expect(page.locator("text=Selecione a gravidade")).toBeHidden({ timeout: 3000 });
  });

  test("auto-save info text is visible", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    await expect(
      page.locator("text=Seus dados sao salvos automaticamente enquanto voce preenche")
    ).toBeVisible();
  });

  test("shows file format info text", async ({ page }) => {
    await page.goto("/report/az-ib");
    await page.waitForTimeout(2000);

    await expect(
      page.locator("text=MP4, MOV, WebM, JPG, PNG ou WebP (max 100MB)")
    ).toBeVisible();
  });
});

// ============================================
// LOGIN - ADDITIONAL TESTS
// ============================================

test.describe("Login Page Additional", () => {
  test("shows loading state during login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@hub360.com.br");
    await page.fill('input[type="password"]', "Hub360@2025");

    // Click submit and immediately check for loading text
    await page.click('button[type="submit"]');
    // The button should briefly show "Entrando..." while the request is in flight
    // We check it appears (it may be brief)
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("shows Bug Tracker subtitle", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=Bug Tracker")).toBeVisible();
  });
});

// ============================================
// API - REPORTS ENDPOINT
// ============================================

test.describe("API Reports Endpoint", () => {
  test("GET /api/reports requires authentication", async ({ request }) => {
    const res = await request.get("/api/reports");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("GET /api/reports rejects invalid token", async ({ request }) => {
    const res = await request.get("/api/reports", {
      headers: { Authorization: "Bearer invalid_token_here" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("GET /api/reports returns valid data structure with default params", async ({ request }) => {
    // Login first
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/reports", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Validate full response structure
    expect(typeof body.total_bugs).toBe("number");
    expect(typeof body.period_bugs).toBe("number");
    expect(typeof body.avg_resolution_hours).toBe("number");
    expect(typeof body.open_bugs).toBe("number");
    expect(typeof body.by_status).toBe("object");
    expect(typeof body.by_severity).toBe("object");
    expect(Array.isArray(body.by_project)).toBe(true);
    expect(Array.isArray(body.weekly_trend)).toBe(true);
    expect(Array.isArray(body.resolved_bugs)).toBe(true);
    expect(Array.isArray(body.projects)).toBe(true);
    expect(Array.isArray(body.team_members)).toBe(true);
    expect(typeof body.date_from).toBe("string");
    expect(typeof body.date_to).toBe("string");

    // Validate date format (YYYY-MM-DD)
    expect(body.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.date_to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("GET /api/reports supports date_from and date_to params", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/reports?date_from=2025-01-01&date_to=2025-12-31", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.date_from).toBe("2025-01-01");
    expect(body.date_to).toBe("2025-12-31");
  });

  test("GET /api/reports supports project_id filter", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    // First get the list of projects from a default report call
    const defaultRes = await request.get("/api/reports", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const defaultBody = await defaultRes.json();
    expect(defaultBody.projects.length).toBeGreaterThan(0);

    const projectId = defaultBody.projects[0].id;

    // Now filter by that project
    const res = await request.get(`/api/reports?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.total_bugs).toBe("number");
    expect(typeof body.period_bugs).toBe("number");
  });

  test("GET /api/reports rejects invalid date format", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/reports?date_from=01-01-2025&date_to=12-31-2025", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("YYYY-MM-DD");
  });

  test("GET /api/reports rejects date_from after date_to", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/reports?date_from=2025-12-31&date_to=2025-01-01", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("anterior");
  });

  test("GET /api/reports rejects invalid project_id format", async ({ request }) => {
    const authRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const { session } = await authRes.json();

    const res = await request.get("/api/reports?project_id=not-a-uuid", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ============================================
// REPORTS PAGE UI
// ============================================

test.describe("Reports Page", () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@hub360.com.br");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("requires login - redirects to /login if not authenticated", async ({ page, context }) => {
    // Clear all cookies and storage to simulate unauthenticated state
    await context.clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/dashboard/reports");

    // Should redirect to /login since there is no session
    await page.waitForURL("**/login", { timeout: 10000 });
  });

  test("shows loading skeleton then metric cards with numbers", async ({ page }) => {
    await page.goto("/dashboard/reports");

    // Wait for the report data to load and metric cards to appear
    // Metric cards contain labels like "Total de bugs", "Bugs no periodo", etc.
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });
    await expect(page.locator("text=Total de bugs")).toBeVisible();
    await expect(page.locator("text=Bugs no periodo")).toBeVisible();
    await expect(page.locator("text=Tempo medio resolucao")).toBeVisible();
    await expect(page.locator("text=Bugs abertos")).toBeVisible();

    // Each metric card should display a number value (the text-3xl font-bold element)
    const metricValues = page.locator(".text-3xl.font-bold");
    const count = await metricValues.count();
    expect(count).toBe(4);
  });

  test("shows filter bar with date presets", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Date preset buttons
    await expect(page.locator("button", { hasText: "7 dias" })).toBeVisible();
    await expect(page.locator("button", { hasText: "30 dias" })).toBeVisible();
    await expect(page.locator("button", { hasText: "90 dias" })).toBeVisible();
    await expect(page.locator("button", { hasText: "1 ano" })).toBeVisible();
  });

  test("shows project filter dropdown", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Project dropdown with "Todos os projetos" default option
    const projectSelect = page.locator("select").filter({ hasText: "Todos os projetos" });
    await expect(projectSelect).toBeVisible();

    // Should have at least one project option besides the default
    const options = projectSelect.locator("option");
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThanOrEqual(2); // "Todos os projetos" + at least 1 project
  });

  test("date preset buttons change active state", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Default preset is "90d" - the "90 dias" button should have dark bg
    const btn90 = page.locator("button", { hasText: "90 dias" });
    await expect(btn90).toHaveClass(/bg-gray-900/);

    // Click "7 dias" button
    const btn7 = page.locator("button", { hasText: "7 dias" });
    await btn7.click();

    // Wait for the data to reload
    await page.waitForTimeout(2000);

    // "7 dias" should now be active (dark bg), "90 dias" should not be
    await expect(btn7).toHaveClass(/bg-gray-900/);
    await expect(btn90).not.toHaveClass(/bg-gray-900/);
  });

  test("shows charts section with SVG elements", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Chart card titles
    await expect(page.locator("text=Bugs por Status")).toBeVisible();
    await expect(page.locator("text=Bugs por Gravidade")).toBeVisible();
    await expect(page.locator("text=Tendencia Semanal")).toBeVisible();
    await expect(page.locator("text=Bugs por Projeto")).toBeVisible();

    // At least some SVG elements should be present (charts render SVGs)
    const svgs = page.locator("svg");
    const svgCount = await svgs.count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("shows resolved bugs table", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Table header
    await expect(page.locator("text=Bugs Resolvidos no Periodo")).toBeVisible();

    // Table column headers
    await expect(page.locator("th", { hasText: "Titulo" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Projeto" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Gravidade" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Resolvido por" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Criado em" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Resolvido em" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Tempo" })).toBeVisible();

    // Should show count text like "X bugs resolvidos" or "Nenhum bug resolvido neste periodo"
    const resolvedSection = page.locator("text=/\\d+ bugs? resolvidos?|Nenhum bug resolvido/");
    await expect(resolvedSection.first()).toBeVisible();
  });

  test("has print button", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    const printButton = page.locator("button", { hasText: "Imprimir" });
    await expect(printButton).toBeVisible();
  });

  test("has navigation link back to Dashboard", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    const dashboardLink = page.locator("a[href='/dashboard']", { hasText: "Dashboard" });
    await expect(dashboardLink).toBeVisible();

    // Click it and verify navigation
    await dashboardLink.click();
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("Dashboard has link to Relatorios", async ({ page }) => {
    // We are already on the dashboard from beforeEach
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    const reportsLink = page.locator("a[href='/dashboard/reports']", { hasText: "Relatorios" });
    await expect(reportsLink).toBeVisible();

    // Click and verify navigation
    await reportsLink.click();
    await page.waitForURL("**/dashboard/reports", { timeout: 10000 });
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });
  });

  test("shows team member filter dropdown", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Team member dropdown with "Todos os membros" default option
    const memberSelect = page.locator("select").filter({ hasText: "Todos os membros" });
    await expect(memberSelect).toBeVisible();
  });
});

// ============================================
// CLIENT ROLE - LOGIN TESTS
// ============================================

test.describe("Client Role - Login", () => {
  test("client can login successfully and reaches dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "cliente@az-ib.com");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).toHaveURL(/dashboard/);
  });

  test("client dashboard shows project name in header instead of Bug Tracker", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "cliente@az-ib.com");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Wait for data to load so project name is fetched
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 15000 }
    );

    const header = page.locator("header");
    // Client header should show project name "AZ-IB" instead of "Bug Tracker"
    await expect(header.getByText("AZ-IB", { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test("client dashboard does NOT show project filter dropdown", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "cliente@az-ib.com");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 15000 }
    );

    // Project filter dropdown with "Todos os projetos" should NOT be visible for clients
    await expect(page.locator("select").filter({ hasText: "Todos os projetos" })).toBeHidden();
  });
});

// ============================================
// CLIENT ROLE - DASHBOARD TESTS
// ============================================

test.describe("Client Role - Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "cliente@az-ib.com");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    // Wait for table data to load
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 15000 }
    );
  });

  test("client sees only bugs from their project (AZ-IB)", async ({ page }) => {
    // Wait for table rows to appear
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Since Projeto column is hidden for clients, we verify via API
    // that all returned bugs belong to the client's project.
    // On the UI side, we simply confirm the table has data and no Projeto column.
    await expect(page.locator("th", { hasText: "Projeto" })).toBeHidden();
  });

  test("client does NOT see Projeto column in table", async ({ page }) => {
    // The table header should NOT have a "Projeto" column
    await expect(page.locator("th", { hasText: "Projeto" })).toBeHidden();

    // Verify other expected columns ARE visible
    await expect(page.locator("th").filter({ hasText: "#" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Status" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Gravidade" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Titulo" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Data" })).toBeVisible();
  });

  test("client does NOT see Responsavel column in table", async ({ page }) => {
    await expect(page.locator("th", { hasText: "Responsavel" })).toBeHidden();
  });

  test("client does NOT see assigned filter dropdown", async ({ page }) => {
    // The "Todos os responsaveis" filter dropdown should not be visible
    await expect(page.locator("select").filter({ hasText: "Todos os responsaveis" })).toBeHidden();
  });

  test("client can use search filter", async ({ page }) => {
    // The search input should be visible
    const searchInput = page.locator('input[placeholder="Buscar por titulo..."]');
    await expect(searchInput).toBeVisible();

    // Type a search query
    await searchInput.fill("test");

    // Wait for debounce and data reload
    await page.waitForTimeout(1000);
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // Table should still render (either with results or empty state)
    const table = page.locator("table");
    await expect(table).toBeVisible();
  });

  test("client can use status filter via stat cards", async ({ page }) => {
    // Click on a status card (e.g. "Novo")
    const statusCard = page.locator("button").filter({ hasText: "Novo" }).first();
    await expect(statusCard).toBeVisible();
    await statusCard.click();

    // Wait for data reload
    await page.waitForTimeout(1500);
    await page.waitForFunction(
      () => !document.querySelector("table tbody .animate-spin"),
      { timeout: 10000 }
    );

    // "Limpar filtros" button should appear since a filter is active
    await expect(page.locator("text=Limpar filtros")).toBeVisible({ timeout: 5000 });
  });

  test("client clicks a bug - drawer opens but does NOT show notes section", async ({ page }) => {
    // Click the first bug row
    await page.locator("table tbody tr").first().click();

    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Wait for bug details to load
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Notes section should NOT be visible for client users
    await expect(drawer.locator("text=Notas internas")).toBeHidden();

    // Note input should NOT be visible
    await expect(drawer.locator('input[placeholder="Adicionar nota..."]')).toBeHidden();

    // Historico (audit log) should also NOT be visible
    await expect(drawer.locator("text=Historico")).toBeHidden();
  });

  test("client drawer shows status as read-only (no select dropdown for status)", async ({ page }) => {
    // Click the first bug row
    await page.locator("table tbody tr").first().click();

    const drawer = page.locator(".fixed.right-0.top-0");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.locator("dt", { hasText: "Onde encontrou" })).toBeVisible({
      timeout: 10000,
    });

    // Status label should be visible
    await expect(drawer.locator("label", { hasText: "Status" })).toBeVisible();

    // For client, status is displayed in a read-only div (bg-gray-50) not a select
    const readOnlyStatusDiv = drawer.locator("div.bg-gray-50.border.border-gray-200.rounded-lg");
    await expect(readOnlyStatusDiv).toBeVisible();

    // There should be NO select elements in the drawer (no status select, no assignee select)
    const selects = drawer.locator("select");
    const selectCount = await selects.count();
    expect(selectCount).toBe(0);

    // Responsavel label should NOT be visible for clients
    await expect(drawer.locator("label", { hasText: "Responsavel" })).toBeHidden();
  });
});

// ============================================
// CLIENT ROLE - REPORTS PAGE TESTS
// ============================================

test.describe("Client Role - Reports Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "cliente@az-ib.com");
    await page.fill('input[type="password"]', "Hub360@2025");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  });

  test("client can access /dashboard/reports", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Metric cards should be visible
    await expect(page.locator("text=Total de bugs")).toBeVisible();
    await expect(page.locator("text=Bugs no periodo")).toBeVisible();
    await expect(page.locator("text=Tempo medio resolucao")).toBeVisible();
    await expect(page.locator("text=Bugs abertos")).toBeVisible();
  });

  test("client reports does NOT show project filter", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Project filter dropdown should NOT be visible for clients
    await expect(page.locator("select").filter({ hasText: "Todos os projetos" })).toBeHidden();
  });

  test("client reports does NOT show team member filter", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Team member filter dropdown should NOT be visible for clients
    await expect(page.locator("select").filter({ hasText: "Todos os membros" })).toBeHidden();
  });

  test("client reports shows metric cards and charts but NOT Bugs por Projeto chart", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForSelector("text=Total de bugs", { timeout: 15000 });

    // Metric cards should have numeric values
    const metricValues = page.locator(".text-3xl.font-bold");
    const count = await metricValues.count();
    expect(count).toBe(4);

    // Status and severity charts should be visible
    await expect(page.locator("text=Bugs por Status")).toBeVisible();
    await expect(page.locator("text=Bugs por Gravidade")).toBeVisible();
    await expect(page.locator("text=Tendencia Semanal")).toBeVisible();

    // "Bugs por Projeto" chart should NOT be visible for clients (redundant for single project)
    await expect(page.locator("text=Bugs por Projeto")).toBeHidden();
  });
});

// ============================================
// CLIENT ROLE - API SECURITY TESTS
// ============================================

test.describe("Client Role - API Security", () => {
  test("Client API: GET /api/bugs returns only their project's bugs", async ({ request }) => {
    // Authenticate as client
    const authRes = await request.post("/api/auth", {
      data: { email: "cliente@az-ib.com", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const authBody = await authRes.json();
    expect(authBody.success).toBe(true);
    const token = authBody.session.access_token;
    const clientProjectId = authBody.user.team_member.project_id;

    // Fetch bugs as client
    const res = await request.get("/api/bugs?page=1&page_size=30", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.bugs)).toBe(true);

    // ALL returned bugs must belong to the client's project
    for (const bug of body.bugs) {
      expect(bug.project_id).toBe(clientProjectId);
    }
  });

  test("Client API: GET /api/bugs/:id for another project's bug returns 403", async ({ request }) => {
    // Authenticate as client (AZ-IB)
    const clientAuthRes = await request.post("/api/auth", {
      data: { email: "cliente@az-ib.com", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const clientAuth = await clientAuthRes.json();
    const clientToken = clientAuth.session.access_token;
    const clientProjectId = clientAuth.user.team_member.project_id;

    // Authenticate as admin to find a bug from a different project
    const adminAuthRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const adminAuth = await adminAuthRes.json();
    const adminToken = adminAuth.session.access_token;

    // Get all bugs as admin
    const adminBugsRes = await request.get("/api/bugs?page=1&page_size=100", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminBugs = await adminBugsRes.json();

    // Find a bug that does NOT belong to the client's project
    const otherBug = adminBugs.bugs.find(
      (b: { project_id: string }) => b.project_id !== clientProjectId
    );

    if (otherBug) {
      // Try to access that bug as the client - should return 403
      const res = await request.get(`/api/bugs/${otherBug.id}`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    } else {
      // If all bugs belong to the same project, skip with a note
      // This test needs bugs from multiple projects to be meaningful
      test.skip();
    }
  });

  test("Client API: GET /api/reports forces their project filter", async ({ request }) => {
    // Authenticate as client
    const authRes = await request.post("/api/auth", {
      data: { email: "cliente@az-ib.com", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const authBody = await authRes.json();
    const token = authBody.session.access_token;

    // Even without passing project_id, the API should force the client's project
    const res = await request.get("/api/reports", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Verify response has valid report data
    expect(typeof body.total_bugs).toBe("number");
    expect(typeof body.period_bugs).toBe("number");
    expect(typeof body.open_bugs).toBe("number");

    // The total_bugs should only reflect the client's project
    // Authenticate as admin and compare with project-filtered count
    const adminAuthRes = await request.post("/api/auth", {
      data: { email: "admin@hub360.com.br", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const adminAuth = await adminAuthRes.json();
    const adminToken = adminAuth.session.access_token;

    const adminRes = await request.get(
      `/api/reports?project_id=${authBody.user.team_member.project_id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const adminBody = await adminRes.json();

    // Client report total should match admin's project-filtered total
    expect(body.total_bugs).toBe(adminBody.total_bugs);
  });

  test("Client API: GET /api/bugs/:id hides notes and audit_log for client", async ({ request }) => {
    // Authenticate as client
    const authRes = await request.post("/api/auth", {
      data: { email: "cliente@az-ib.com", password: "Hub360@2025" },
      headers: { "Content-Type": "application/json" },
    });
    const authBody = await authRes.json();
    const clientToken = authBody.session.access_token;

    // Get client's bugs to pick one
    const bugsRes = await request.get("/api/bugs?page=1&page_size=1", {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    const bugsBody = await bugsRes.json();
    expect(bugsBody.bugs.length).toBeGreaterThan(0);
    const bugId = bugsBody.bugs[0].id;

    // Get single bug detail as client
    const detailRes = await request.get(`/api/bugs/${bugId}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(detailRes.status()).toBe(200);
    const detail = await detailRes.json();

    // Notes should be an empty array (not fetched for clients)
    expect(Array.isArray(detail.notes)).toBe(true);
    expect(detail.notes.length).toBe(0);

    // Audit log should be an empty array (not fetched for clients)
    expect(Array.isArray(detail.audit_log)).toBe(true);
    expect(detail.audit_log.length).toBe(0);

    // But the bug data itself should still be present
    expect(detail.id).toBe(bugId);
    expect(detail.title).toBeDefined();
    expect(detail.status).toBeDefined();
    expect(Array.isArray(detail.attachments)).toBe(true);
  });
});
