import { useState, FormEvent } from "react";
import "./App.css";

function App() {
	const [email, setEmail] = useState("user@example.com");
	const [password, setPassword] = useState("password123");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	// Extract path segment from current URL
	const getPathSegment = (): string => {
		const pathname = window.location.pathname;
		const segments = pathname.split("/").filter(Boolean);
		return segments[0] || "";
	};

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");
		setLoading(true);
		setSuccess(false);

		const pathSegment = getPathSegment();
		const apiPath = pathSegment ? `/${pathSegment}/api/create-account` : "/api/create-account";

		try {
			const response = await fetch(apiPath, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email, password }),
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.message || "Login failed");
				return;
			}

			setSuccess(true);
		} catch {
			setError("Network error. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="login-container">
			<div className="login-card">
				<h1>Sign up</h1>
				<form onSubmit={handleSubmit}>
					<div className="form-group">
						<label htmlFor="email">Email</label>
						<input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							disabled={loading}
						/>
					</div>
					<div className="form-group">
						<label htmlFor="password">Password</label>
						<input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							disabled={loading}
						/>
					</div>
					<div className="message-container">
						{error && <div className="error-message">{error}</div>}
						{success && <div className="success-message">Account created successfully!</div>}
					</div>
					<button type="submit" disabled={loading} className="login-button">
						{loading ? "Creating account..." : "Create account"}
					</button>
				</form>
			</div>
		</div>
	);
}

export default App;
