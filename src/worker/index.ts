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
	// Extract path segment from URL if present
	const pathSegment = c.req.param("pathSegment") ?? "";
	const basePath = pathSegment ? `/${pathSegment}` : "";
	const iframePage = `${basePath}/form-test.html`;
	const navigatePage = `${basePath}/form-test-navigate.html`;

	try {
		const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const contentType = c.req.header("content-type") ?? "";
		const contentLength = c.req.header("content-length") ?? "";
		const secFetchMode = c.req.header("sec-fetch-mode") ?? "";
		const secFetchDest = c.req.header("sec-fetch-dest") ?? "";
		const secFetchSite = c.req.header("sec-fetch-site") ?? "";
		const origin = c.req.header("origin") ?? "";
		const referer = c.req.header("referer") ?? "";

		// IMPORTANT: don't log sensitive values
		let rawBodyLength: number | null = null;
		let rawBodyLooksMultipart = false;
		let rawBodyHasUrlencodedEmail = false;
		let rawBodyHasUrlencodedPassword = false;
		let rawBodyHasMultipartEmail = false;
		let rawBodyHasMultipartPassword = false;
		let rawBodyHasFpData = false;
		let rawBodyHasMultipartFpData = false;
		let rawBodyHasFpDataSubstring = false;
		let multipartBoundaryFromBody: string | null = null;
		let rawTextForFallback: string | null = null;
		try {
			const rawText = await c.req.raw.clone().text();
			rawTextForFallback = rawText;
			rawBodyLength = rawText.length;
			rawBodyLooksMultipart = rawText.startsWith("--") && rawText.includes("Content-Disposition: form-data;");
			rawBodyHasUrlencodedEmail = rawText.includes("email=");
			rawBodyHasUrlencodedPassword = rawText.includes("password=");
			rawBodyHasMultipartEmail = rawText.includes('name="email"');
			rawBodyHasMultipartPassword = rawText.includes('name="password"');
			rawBodyHasFpData = rawText.includes("fp-data=");
			rawBodyHasMultipartFpData = rawText.includes('name="fp-data"');
			rawBodyHasFpDataSubstring = rawText.includes("fp-data");

			if (rawBodyLooksMultipart) {
				const firstLine = rawText.split("\n", 1)[0]?.trimEnd() ?? "";
				if (firstLine.startsWith("--") && firstLine.length > 2) {
					multipartBoundaryFromBody = firstLine.slice(2);
				}
			}
		} catch {
			// ignore body-clone failures
		}

		console.log(
			"[form-submit] start",
			JSON.stringify({
				reqId,
				pathSegment,
				method: c.req.method,
				url: c.req.url,
				headers: {
					"content-type": contentType,
					"content-length": contentLength,
					"sec-fetch-mode": secFetchMode,
					"sec-fetch-dest": secFetchDest,
					"sec-fetch-site": secFetchSite,
					origin,
					referer,
				},
				rawBody: {
					length: rawBodyLength,
					looksMultipart: rawBodyLooksMultipart,
					hasUrlencodedEmail: rawBodyHasUrlencodedEmail,
					hasUrlencodedPassword: rawBodyHasUrlencodedPassword,
					hasMultipartEmail: rawBodyHasMultipartEmail,
					hasMultipartPassword: rawBodyHasMultipartPassword,
					hasFpData: rawBodyHasFpData,
					hasMultipartFpData: rawBodyHasMultipartFpData,
					hasFpDataSubstring: rawBodyHasFpDataSubstring,
					multipartBoundaryFromBody,
				},
			}),
		);

		if (rawBodyLooksMultipart && contentType.includes("application/x-www-form-urlencoded")) {
			console.log(
				"[form-submit] header-body-mismatch",
				JSON.stringify({
					reqId,
					pathSegment,
					headerContentType: contentType,
					bodyLooksMultipart: true,
					multipartBoundaryFromBody,
				}),
			);
		}

		const parseMultipartFromRaw = (rawText: string): Record<string, string> | null => {
			// Very small, tolerant multipart parser that does NOT rely on Content-Type boundary.
			// We only need it for email/password/fp-data when an intermediary strips the boundary header.
			if (!(rawText.startsWith("--") && rawText.includes("Content-Disposition: form-data;"))) return null;

			const firstLine = rawText.split("\n", 1)[0]?.trimEnd() ?? "";
			if (!firstLine.startsWith("--") || firstLine.length <= 2) return null;
			const boundary = firstLine.slice(2);
			const marker = `--${boundary}`;
			const endMarker = `--${boundary}--`;

			const parts = rawText.split(marker);
			const out: Record<string, string> = {};

			for (const part of parts) {
				const trimmed = part.trim();
				if (!trimmed || trimmed === "--" || trimmed === endMarker) continue;

				// Separate headers and body
				const headerEndIdx = trimmed.indexOf("\r\n\r\n");
				if (headerEndIdx < 0) continue;
				const headerBlock = trimmed.slice(0, headerEndIdx);
				const bodyBlock = trimmed.slice(headerEndIdx + 4);

				const nameMatch = headerBlock.match(/name="([^"]+)"/);
				if (!nameMatch) continue;
				const name = nameMatch[1]!;

				// Body may include trailing boundary newlines; be conservative
				const value = bodyBlock.replace(/\r\n$/, "");
				out[name] = value;
			}

			return out;
		};

		const formData = await c.req.parseBody();

		// If parseBody failed due to header/body mismatch, try fallback multipart parsing.
		// Symptom: keys contain the raw boundary line / header fragments.
		const parsedKeys = Object.keys(formData);
		const parseLooksBroken =
			parsedKeys.length === 1 && parsedKeys[0]?.includes("Content-Disposition: form-data; name") === true;

		const fallback =
			rawTextForFallback && (parseLooksBroken || (rawBodyLooksMultipart && contentType.includes("application/x-www-form-urlencoded")))
				? parseMultipartFromRaw(rawTextForFallback)
				: null;

		const effective = fallback ? { ...formData, ...fallback } : formData;

		const email = String((effective as Record<string, unknown>).email ?? "");
		const password = String((effective as Record<string, unknown>).password ?? "");
		const fpData = String((effective as Record<string, unknown>)["fp-data"] ?? "");
		const fallbackFieldLengths = fallback
			? Object.fromEntries(Object.entries(fallback).map(([k, v]) => [k, v.length]))
			: {};

		console.log(
			"[form-submit] parsed",
			JSON.stringify({
				reqId,
				pathSegment,
				keys: Object.keys(formData).sort(),
				fallbackUsed: Boolean(fallback),
				fallbackKeys: fallback ? Object.keys(fallback).sort() : [],
				fallbackFieldLengths,
				emailPresent: email.length > 0,
				emailLength: email.length,
				passwordPresent: password.length > 0,
				passwordLength: password.length,
				fpDataPresent: fpData.length > 0,
				fpDataLength: fpData.length,
			}),
		);

		if (!email || !password) {
			console.log(
				"[form-submit] missing-fields",
				JSON.stringify({
					reqId,
					pathSegment,
					keys: Object.keys(formData).sort(),
					emailPresent: email.length > 0,
					passwordPresent: password.length > 0,
					fpDataPresent: fpData.length > 0,
					fpDataLength: fpData.length,
				}),
			);
			return c.html(`
				<!DOCTYPE html>
				<html>
				<head><title>Error</title></head>
				<body>
					<h1>Error</h1>
					<p>Email and password are required</p>
					<p><a href="${iframePage}">← Back (iframe)</a> | <a href="${navigatePage}">← Back (navigate)</a></p>
				</body>
				</html>
			`, 400);
		}

		return c.html(`
			<!DOCTYPE html>
			<html>
			<head><title>Success</title></head>
			<body>
				<h1>Account Created Successfully!</h1>
				<p>Email: ${email}</p>
				<p><a href="${iframePage}">← Back (iframe)</a> | <a href="${navigatePage}">← Back (navigate)</a></p>
			</body>
			</html>
		`);
	} catch (error) {
		console.log(
			"[form-submit] error",
			JSON.stringify({
				pathSegment,
				message: error instanceof Error ? error.message : String(error),
			}),
		);
		return c.html(`
			<!DOCTYPE html>
			<html>
			<head><title>Error</title></head>
			<body>
				<h1>Error</h1>
				<p>${error instanceof Error ? error.message : "Unknown error"}</p>
				<p><a href="${iframePage}">← Back (iframe)</a> | <a href="${navigatePage}">← Back (navigate)</a></p>
			</body>
			</html>
		`, 400);
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
        <form id="sameOriginForm" method="POST" action="${apiPath}" target="sameOriginResult">
            <input type="hidden" name="email" id="sameOriginEmail">
            <input type="hidden" name="password" id="sameOriginPassword">
            <button type="submit">Submit Form (Same Origin)</button>
        </form>
        <p>Result:</p>
        <iframe name="sameOriginResult" class="result-frame"></iframe>
    </div>

    <div class="section">
        <h2>Cross Origin Form POST</h2>
        <p><code>${crossOriginPath}</code></p>
        <form id="crossOriginForm" method="POST" action="${crossOriginPath}" target="crossOriginResult">
            <input type="hidden" name="email" id="crossOriginEmail">
            <input type="hidden" name="password" id="crossOriginPassword">
            <button type="submit">Submit Form (Cross Origin)</button>
        </form>
        <p>Result:</p>
        <iframe name="crossOriginResult" class="result-frame"></iframe>
    </div>

    <script>
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        function syncValues() {
            document.getElementById('sameOriginEmail').value = emailInput.value;
            document.getElementById('sameOriginPassword').value = passwordInput.value;
            document.getElementById('crossOriginEmail').value = emailInput.value;
            document.getElementById('crossOriginPassword').value = passwordInput.value;
        }
        emailInput.addEventListener('input', syncValues);
        passwordInput.addEventListener('input', syncValues);
        document.getElementById('sameOriginForm').addEventListener('submit', syncValues);
        document.getElementById('crossOriginForm').addEventListener('submit', syncValues);
        syncValues();
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
        <form id="sameOriginForm" method="POST" action="${apiPath}">
            <input type="hidden" name="email" id="sameOriginEmail">
            <input type="hidden" name="password" id="sameOriginPassword">
            <button type="submit">Submit Form (Same Origin)</button>
        </form>
    </div>

    <div class="section">
        <h2>Cross Origin</h2>
        <p><code>${crossOriginPath}</code></p>
        <form id="crossOriginForm" method="POST" action="${crossOriginPath}">
            <input type="hidden" name="email" id="crossOriginEmail">
            <input type="hidden" name="password" id="crossOriginPassword">
            <button type="submit">Submit Form (Cross Origin)</button>
        </form>
    </div>

    <script>
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        function syncValues() {
            document.getElementById('sameOriginEmail').value = emailInput.value;
            document.getElementById('sameOriginPassword').value = passwordInput.value;
            document.getElementById('crossOriginEmail').value = emailInput.value;
            document.getElementById('crossOriginPassword').value = passwordInput.value;
        }
        emailInput.addEventListener('input', syncValues);
        passwordInput.addEventListener('input', syncValues);
        document.getElementById('sameOriginForm').addEventListener('submit', syncValues);
        document.getElementById('crossOriginForm').addEventListener('submit', syncValues);
        syncValues();
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
