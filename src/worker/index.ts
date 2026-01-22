import { Hono, Context } from "hono";
import { cors } from "hono/cors";

type AppContext = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for cross-origin requests
app.use("*", cors());

// Handle login API route handler (shared logic)
const handleLogin = async (c: AppContext, pathSegment?: string) => {
	try {
		const body = await c.req.json() as { email: string; password: string };

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

// All other routes will be handled by Cloudflare's static asset serving
// which will serve the client app (SPA mode) for any path segment
// This includes routes like /:pathSegment/* which will serve index.html

export default app;
