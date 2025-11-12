import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.post("/api/login", async (c) => {
	try {
		const body = await c.req.json<{ email: string; password: string }>();

		if (!body.email || !body.password) {
			return c.json({ message: "Email and password are required" }, 400);
		}

		// Simple validation - in production, verify against a database
		// For now, accept any non-empty credentials
		if (body.email.trim() === "" || body.password.trim() === "") {
			return c.json({ message: "Email and password cannot be empty" }, 400);
		}

		return c.json({ message: "Login successful", email: body.email });
	} catch (error) {
		return c.json({ message: "Invalid request", error: error instanceof Error ? error.message : error }, 400);
	}
});

export default app;
