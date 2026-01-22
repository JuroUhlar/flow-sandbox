import { Hono, Context } from "hono";
import { cors } from "hono/cors";

type AppContext = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for cross-origin requests
app.use("*", cors());

// Parse request body based on content type (JSON or form data)
const parseRequestBody = async (c: AppContext): Promise<{ email: string; password: string }> => {
	const contentType = (c.req.header("content-type") ?? "").toLowerCase();

	if (contentType.includes("application/json")) {
		return await c.req.json();
	}

	// Form submissions (default to form parsing if no content-type or form-urlencoded)
	if (
		contentType.includes("application/x-www-form-urlencoded") ||
		contentType.includes("multipart/form-data") ||
		contentType === ""
	) {
		const formData = await c.req.parseBody();
		return {
			email: String(formData.email ?? ""),
			password: String(formData.password ?? ""),
		};
	}

	throw new Error(`Unsupported content type: ${contentType}`);
};

// Handle login API route handler (shared logic)
const handleLogin = async (c: AppContext, pathSegment?: string) => {
	try {
		const body = await parseRequestBody(c);

		if (!body.email || !body.password) {
			return c.json({ message: "Email and password are required" }, 400);
		}

		// Simple validation - in production, verify against a database
		// For now, accept any non-empty credentials
		if (body.email.trim() === "" || body.password.trim() === "") {
			return c.json({ message: "Email and password cannot be empty" }, 400);
		}

		return c.json({ message: "Login successful", email: body.email, pathSegment });
	} catch (error) {
		return c.json({ message: "Invalid request", error: error instanceof Error ? error.message : error }, 400);
	}
};

// Handle API routes with path segment: /:pathSegment/api/login
app.post("/:pathSegment/api/create-account", async (c) => {
	const pathSegment = c.req.param("pathSegment");
	return handleLogin(c, pathSegment);
});

// Handle root API route: /api/login (for backward compatibility or root access)
app.post("/api/create-account", async (c) => {
	return handleLogin(c);
});

// Dedicated form submission endpoint - returns HTML for browser display
const handleFormSubmission = async (c: AppContext) => {
	// Extract path segment from URL if present (route may or may not define it)
	const pathSegment = (() => {
		try {
			return c.req.param("pathSegment");
		} catch {
			return "";
		}
	})();

	const basePath = pathSegment ? `/${pathSegment}` : "";
	const iframePage = `${basePath}/form-test.html`;
	const navigatePage = `${basePath}/form-test-navigate.html`;

	const escapeHtml = (input: string) =>
		input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");

	const debugFromQuery = c.req.query("debug") === "1";
	let rawText = "";

	try {
		// Clone is important: reading body consumes the stream
		rawText = await c.req.raw.clone().text();
		// Allow debug to be requested via a form field too (keeps URL unchanged)
		// This helps when the injected fp script only triggers on specific URLs.
		const debugFromBody = /(?:^|&)debug=1(?:&|$)/.test(rawText);
		const debug = debugFromQuery || debugFromBody;

		const formData = await c.req.parseBody();

		const email = String(formData.email ?? "");
		const password = String(formData.password ?? "");
		const fpData = String(formData["fp-data"] ?? "");

		if (debug) {
			const headers = {
				"content-type": c.req.header("content-type") ?? "",
				"content-length": c.req.header("content-length") ?? "",
				"sec-fetch-mode": c.req.header("sec-fetch-mode") ?? "",
				"sec-fetch-dest": c.req.header("sec-fetch-dest") ?? "",
				"sec-fetch-site": c.req.header("sec-fetch-site") ?? "",
				"origin": c.req.header("origin") ?? "",
				"referer": c.req.header("referer") ?? "",
				"user-agent": c.req.header("user-agent") ?? "",
			} as const;

			const redactedRawText = rawText
				.replace(/email=[^&]*/i, "email=[redacted]")
				.replace(/password=[^&]*/i, "password=[redacted]");

			const debugInfo = {
				pathSegment,
				method: c.req.method,
				url: c.req.url,
				headers,
				rawBody: {
					length: rawText.length,
					preview: redactedRawText.slice(0, 400),
					containsEmailKey: rawText.includes("email="),
					containsPasswordKey: rawText.includes("password="),
					containsFpDataKey: rawText.includes("fp-data="),
					containsDebugKey: rawText.includes("debug=1"),
				},
				parsed: {
					keys: Object.keys(formData).sort(),
					emailPresent: email.length > 0,
					emailLength: email.length,
					passwordPresent: password.length > 0,
					passwordLength: password.length,
					fpDataPresent: fpData.length > 0,
					fpDataLength: fpData.length,
					debugFieldPresent: String(formData.debug ?? "") === "1",
				},
			};

			return c.html(
				`<!DOCTYPE html>
<html>
<head><title>Debug</title></head>
<body>
  <h1>Debug: /__forms/create-account</h1>
  <p><a href="${iframePage}">← Back (iframe)</a> | <a href="${navigatePage}">← Back (navigate)</a></p>
  <pre>${escapeHtml(JSON.stringify(debugInfo, null, 2))}</pre>
</body>
</html>`,
			);
		}

		if (!email || !password) {
			return c.html(
				`<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
  <h1>Error</h1>
  <p>Email and password are required</p>
  <p><a href="${iframePage}">← Back (iframe)</a> | <a href="${navigatePage}">← Back (navigate)</a></p>
</body>
</html>`,
				400,
			);
		}

		return c.html(
			`<!DOCTYPE html>
<html>
<head><title>Success</title></head>
<body>
  <h1>Account Created Successfully!</h1>
  <p>Email: ${escapeHtml(email)}</p>
  <p><a href="${iframePage}">← Back (iframe)</a> | <a href="${navigatePage}">← Back (navigate)</a></p>
</body>
</html>`,
		);
	} catch (error) {
		// If parse fails but debug was requested via query or body, show debug info anyway.
		const debugFromBody = /(?:^|&)debug=1(?:&|$)/.test(rawText);
		const debug = debugFromQuery || debugFromBody;
		if (debug) {
			const headers = {
				"content-type": c.req.header("content-type") ?? "",
				"content-length": c.req.header("content-length") ?? "",
				"sec-fetch-mode": c.req.header("sec-fetch-mode") ?? "",
				"sec-fetch-dest": c.req.header("sec-fetch-dest") ?? "",
				"sec-fetch-site": c.req.header("sec-fetch-site") ?? "",
				"origin": c.req.header("origin") ?? "",
				"referer": c.req.header("referer") ?? "",
				"user-agent": c.req.header("user-agent") ?? "",
			} as const;

			const redactedRawText = rawText
				.replace(/email=[^&]*/i, "email=[redacted]")
				.replace(/password=[^&]*/i, "password=[redacted]");

			const debugInfo = {
				pathSegment,
				method: c.req.method,
				url: c.req.url,
				headers,
				error: error instanceof Error ? error.message : "Unknown error",
				rawBody: {
					length: rawText.length,
					preview: redactedRawText.slice(0, 400),
					containsEmailKey: rawText.includes("email="),
					containsPasswordKey: rawText.includes("password="),
					containsFpDataKey: rawText.includes("fp-data="),
					containsDebugKey: rawText.includes("debug=1"),
				},
			};

			return c.html(
				`<!DOCTYPE html>
<html>
<head><title>Debug</title></head>
<body>
  <h1>Debug: /__forms/create-account (parse error)</h1>
  <p><a href="${iframePage}">← Back (iframe)</a> | <a href="${navigatePage}">← Back (navigate)</a></p>
  <pre>${escapeHtml(JSON.stringify(debugInfo, null, 2))}</pre>
</body>
</html>`,
				400,
			);
		}

		return c.html(
			`<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
  <h1>Error</h1>
  <p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p>
  <p><a href="${iframePage}">← Back (iframe)</a> | <a href="${navigatePage}">← Back (navigate)</a></p>
</body>
</html>`,
			400,
		);
	}
};

app.post("/form-api/create-account", handleFormSubmission);
app.post("/__forms/create-account", handleFormSubmission);
app.post("/:pathSegment/__forms/create-account", handleFormSubmission);

// Form test page HTML generator
const CROSS_ORIGIN_BASE = "https://flow-2.jurajuhlar.site";

const generateFormTestPage = (pathSegment: string, useIframe: boolean) => {
	const apiPath = pathSegment ? `/${pathSegment}/__forms/create-account` : "/__forms/create-account";
	const crossOriginPath = `${CROSS_ORIGIN_BASE}${apiPath}`;
	const currentPath = pathSegment ? `/${pathSegment}` : "";
	const iframePage = `${currentPath}/form-test.html`;
	const navigatePage = `${currentPath}/form-test-navigate.html`;
	const mainApp = `${currentPath}/`;

	if (useIframe) {
		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Form Submission Test (Iframe)</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="email"], input[type="password"] { width: 100%; padding: 8px; box-sizing: border-box; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
        h2 { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 20px; }
        .result-frame { width: 100%; height: 200px; border: 2px solid #333; margin-top: 10px; background: #f5f5f5; }
        .section { margin-bottom: 40px; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>Form Submission Test (Iframe)</h1>
    <p>Path segment: <strong>${pathSegment || "(none)"}</strong></p>
    <label style="display:inline-flex; align-items:center; gap:8px; margin: 10px 0 0;">
        <input type="checkbox" id="debugToggle">
        Include <code>debug=1</code> form field (shows server debug)
    </label>
    
    <div class="nav" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #ccc;">
        <a href="${mainApp}">← Main App</a>
        <a href="${navigatePage}">Navigate Version (no iframe)</a>
    </div>

    <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" value="user@example.com">
    </div>
    <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" value="password123">
    </div>

    <div class="section">
        <h2>Same Origin Form POST</h2>
        <p><code>${apiPath}</code></p>
        <form id="sameOriginForm" method="POST" action="${apiPath}" data-base-action="${apiPath}" target="sameOriginResult">
            <input type="hidden" name="email" id="sameOriginEmail">
            <input type="hidden" name="password" id="sameOriginPassword">
            <input type="hidden" name="debug" id="sameOriginDebug">
            <button type="submit">Submit Form (Same Origin)</button>
        </form>
        <p>Result:</p>
        <iframe name="sameOriginResult" class="result-frame"></iframe>
    </div>

    <div class="section">
        <h2>Cross Origin Form POST</h2>
        <p><code>${crossOriginPath}</code></p>
        <form id="crossOriginForm" method="POST" action="${crossOriginPath}" data-base-action="${crossOriginPath}" target="crossOriginResult">
            <input type="hidden" name="email" id="crossOriginEmail">
            <input type="hidden" name="password" id="crossOriginPassword">
            <input type="hidden" name="debug" id="crossOriginDebug">
            <button type="submit">Submit Form (Cross Origin)</button>
        </form>
        <p>Result:</p>
        <iframe name="crossOriginResult" class="result-frame"></iframe>
    </div>

    <script>
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const debugToggle = document.getElementById('debugToggle');
        const sameOriginForm = document.getElementById('sameOriginForm');
        const crossOriginForm = document.getElementById('crossOriginForm');

        function updateActions() {
            const debugValue = debugToggle.checked ? '1' : '';
            document.getElementById('sameOriginDebug').value = debugValue;
            document.getElementById('crossOriginDebug').value = debugValue;
            // Keep action stable to avoid changing any instrumentation routing logic
            sameOriginForm.action = sameOriginForm.dataset.baseAction;
            crossOriginForm.action = crossOriginForm.dataset.baseAction;
        }
        function syncValues() {
            document.getElementById('sameOriginEmail').value = emailInput.value;
            document.getElementById('sameOriginPassword').value = passwordInput.value;
            document.getElementById('crossOriginEmail').value = emailInput.value;
            document.getElementById('crossOriginPassword').value = passwordInput.value;
        }
        emailInput.addEventListener('input', syncValues);
        passwordInput.addEventListener('input', syncValues);
        debugToggle.addEventListener('change', updateActions);
        sameOriginForm.addEventListener('submit', () => { syncValues(); updateActions(); });
        crossOriginForm.addEventListener('submit', () => { syncValues(); updateActions(); });
        syncValues();
        updateActions();
    </script>
</body>
</html>`;
	} else {
		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Form Submission Test (Navigate)</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="email"], input[type="password"] { width: 100%; padding: 8px; box-sizing: border-box; }
        button { padding: 10px 20px; margin: 5px 5px 5px 0; cursor: pointer; }
        .section { margin: 30px 0; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
        h2 { margin-top: 0; }
        .nav { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #ccc; }
        .nav a { margin-right: 15px; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>Form Submission Test (Navigate)</h1>
    <p>Path segment: <strong>${pathSegment || "(none)"}</strong></p>
    <p>These forms navigate away from the page when submitted. Use browser back button to return.</p>
    <label style="display:inline-flex; align-items:center; gap:8px; margin: 10px 0 0;">
        <input type="checkbox" id="debugToggle">
        Include <code>debug=1</code> form field (shows server debug)
    </label>
    
    <div class="nav">
        <a href="${mainApp}">← Main App</a>
        <a href="${iframePage}">Iframe Version</a>
    </div>

    <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" value="user@example.com">
    </div>
    <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" value="password123">
    </div>

    <div class="section">
        <h2>Same Origin</h2>
        <p><code>${apiPath}</code></p>
        <form id="sameOriginForm" method="POST" action="${apiPath}" data-base-action="${apiPath}">
            <input type="hidden" name="email" id="sameOriginEmail">
            <input type="hidden" name="password" id="sameOriginPassword">
            <input type="hidden" name="debug" id="sameOriginDebug">
            <button type="submit">Submit Form (Same Origin)</button>
        </form>
    </div>

    <div class="section">
        <h2>Cross Origin</h2>
        <p><code>${crossOriginPath}</code></p>
        <form id="crossOriginForm" method="POST" action="${crossOriginPath}" data-base-action="${crossOriginPath}">
            <input type="hidden" name="email" id="crossOriginEmail">
            <input type="hidden" name="password" id="crossOriginPassword">
            <input type="hidden" name="debug" id="crossOriginDebug">
            <button type="submit">Submit Form (Cross Origin)</button>
        </form>
    </div>

    <script>
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const debugToggle = document.getElementById('debugToggle');
        const sameOriginForm = document.getElementById('sameOriginForm');
        const crossOriginForm = document.getElementById('crossOriginForm');

        function updateActions() {
            const debugValue = debugToggle.checked ? '1' : '';
            document.getElementById('sameOriginDebug').value = debugValue;
            document.getElementById('crossOriginDebug').value = debugValue;
            // Keep action stable to avoid changing any instrumentation routing logic
            sameOriginForm.action = sameOriginForm.dataset.baseAction;
            crossOriginForm.action = crossOriginForm.dataset.baseAction;
        }
        function syncValues() {
            document.getElementById('sameOriginEmail').value = emailInput.value;
            document.getElementById('sameOriginPassword').value = passwordInput.value;
            document.getElementById('crossOriginEmail').value = emailInput.value;
            document.getElementById('crossOriginPassword').value = passwordInput.value;
        }
        emailInput.addEventListener('input', syncValues);
        passwordInput.addEventListener('input', syncValues);
        debugToggle.addEventListener('change', updateActions);
        sameOriginForm.addEventListener('submit', () => { syncValues(); updateActions(); });
        crossOriginForm.addEventListener('submit', () => { syncValues(); updateActions(); });
        syncValues();
        updateActions();
    </script>
</body>
</html>`;
	}
};

// Serve form test pages (with path segment support)
app.get("/form-test.html", (c) => c.html(generateFormTestPage("", true)));
app.get("/form-test-navigate.html", (c) => c.html(generateFormTestPage("", false)));
app.get("/:pathSegment/form-test.html", (c) => c.html(generateFormTestPage(c.req.param("pathSegment"), true)));
app.get("/:pathSegment/form-test-navigate.html", (c) => c.html(generateFormTestPage(c.req.param("pathSegment"), false)));

// All other routes will be handled by Cloudflare's static asset serving
// which will serve the client app (SPA mode) for any path segment
// This includes routes like /:pathSegment/* which will serve index.html

export default app;
