import { useState, FormEvent } from "react";
import "./App.css";

const CROSS_ORIGIN_BASE = "https://flow-2.jurajuhlar.site";

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

	const submitRequest = async (crossOrigin: boolean) => {
		setError("");
		setLoading(true);
		setSuccess(false);

		const pathSegment = getPathSegment();
		const apiPath = pathSegment ? `/${pathSegment}/api/create-account` : "/api/create-account";
		const url = crossOrigin ? `${CROSS_ORIGIN_BASE}${apiPath}` : apiPath;

		try {
			const response = await fetch(url, {
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

	const handleFetchSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		await submitRequest(false);
	};

	const handleFetchCrossOrigin = async () => {
		await submitRequest(true);
	};

	// XHR request handler
	const submitXhr = (crossOrigin: boolean) => {
		setError("");
		setLoading(true);
		setSuccess(false);

		const pathSegment = getPathSegment();
		const apiPath = pathSegment ? `/${pathSegment}/api/create-account` : "/api/create-account";
		const url = crossOrigin ? `${CROSS_ORIGIN_BASE}${apiPath}` : apiPath;

		const xhr = new XMLHttpRequest();
		xhr.open("POST", url, true);
		xhr.setRequestHeader("Content-Type", "application/json");

		xhr.onload = () => {
			setLoading(false);
			try {
				const data = JSON.parse(xhr.responseText);
				if (xhr.status >= 200 && xhr.status < 300) {
					setSuccess(true);
				} else {
					setError(data.message || "Login failed");
				}
			} catch {
				setError("Failed to parse response");
			}
		};

		xhr.onerror = () => {
			setLoading(false);
			setError("Network error. Please try again.");
		};

		xhr.send(JSON.stringify({ email, password }));
	};

	// Form submission handler (navigates away from page)
	const submitForm = (crossOrigin: boolean) => {
		const pathSegment = getPathSegment();
		const apiPath = pathSegment ? `/${pathSegment}/api/create-account` : "/api/create-account";
		const url = crossOrigin ? `${CROSS_ORIGIN_BASE}${apiPath}` : apiPath;

		const form = document.createElement("form");
		form.method = "POST";
		form.action = url;
		form.enctype = "application/x-www-form-urlencoded";

		const emailInput = document.createElement("input");
		emailInput.type = "hidden";
		emailInput.name = "email";
		emailInput.value = email;
		form.appendChild(emailInput);

		const passwordInput = document.createElement("input");
		passwordInput.type = "hidden";
		passwordInput.name = "password";
		passwordInput.value = password;
		form.appendChild(passwordInput);

		document.body.appendChild(form);
		form.submit();
	};

	return (
		<div className="login-container">
			<div className="login-card">
				<h1>Sign up</h1>
				<form onSubmit={handleFetchSubmit}>
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

					<h3>Fetch</h3>
					<button type="submit" disabled={loading} className="login-button">
						{loading ? "Creating account..." : "Same origin"}
					</button>
					<button
						type="button"
						disabled={loading}
						className="login-button"
						onClick={handleFetchCrossOrigin}
					>
						Cross origin
					</button>

					<h3>XHR</h3>
					<button
						type="button"
						disabled={loading}
						className="login-button"
						onClick={() => submitXhr(false)}
					>
						Same origin
					</button>
					<button
						type="button"
						disabled={loading}
						className="login-button"
						onClick={() => submitXhr(true)}
					>
						Cross origin
					</button>

					<h3>Form submission</h3>
					<button
						type="button"
						disabled={loading}
						className="login-button"
						onClick={() => submitForm(false)}
					>
						Same origin
					</button>
					<button
						type="button"
						disabled={loading}
						className="login-button"
						onClick={() => submitForm(true)}
					>
						Cross origin
					</button>
				</form>
			</div>
		</div>
	);
}

export default App;
