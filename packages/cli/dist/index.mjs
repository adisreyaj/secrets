#!/usr/bin/env node
import { parseEnvFile, summarizeImportResults } from "./env.mjs";
import { createDebugLogger } from "./log.mjs";
import { spawn } from "node:child_process";
import process$1 from "node:process";
import { CONFIG_FILENAME, createClient, normalizeConfigInput, readConfigFile } from "@secrets/sdk";
import { useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";

//#region src/ui/shared.tsx
function useTextInput(initialValue) {
	const [value, setValue] = useState(initialValue);
	useInput((input, key) => {
		if (key.return) return;
		if (key.backspace || key.delete) {
			setValue((current) => current.slice(0, -1));
			return;
		}
		if (key.ctrl || key.meta) return;
		if (!input) return;
		setValue((current) => `${current}${input}`);
	});
	return [value, setValue];
}
function promptText(question, initialValue) {
	return new Promise((resolve, reject) => {
		const Prompt = () => {
			const { exit } = useApp();
			const [value] = useTextInput(initialValue);
			useInput((input, key) => {
				if (key.ctrl && input === "c") {
					exit();
					reject(/* @__PURE__ */ new Error("Aborted"));
					return;
				}
				if (key.return) {
					exit();
					resolve(value.trim() || initialValue);
				}
			});
			return /* @__PURE__ */ jsxs(Box, {
				flexDirection: "column",
				children: [/* @__PURE__ */ jsx(Text, { children: question }), /* @__PURE__ */ jsx(Text, { children: `> ${value}` })]
			});
		};
		render(/* @__PURE__ */ jsx(Prompt, {}));
	});
}
function promptConfirm(question, defaultYes) {
	return new Promise((resolve, reject) => {
		const Prompt = () => {
			const { exit } = useApp();
			const hint = defaultYes ? "[Y/n]" : "[y/N]";
			useInput((input, key) => {
				if (key.ctrl && input === "c") {
					exit();
					reject(/* @__PURE__ */ new Error("Aborted"));
					return;
				}
				if (key.return) {
					exit();
					resolve(defaultYes);
					return;
				}
				const normalized = input.trim().toLowerCase();
				if (normalized === "y") {
					exit();
					resolve(true);
				}
				if (normalized === "n") {
					exit();
					resolve(false);
				}
			});
			return /* @__PURE__ */ jsxs(Box, {
				flexDirection: "column",
				children: [/* @__PURE__ */ jsx(Text, { children: `${question} ${hint}` }), /* @__PURE__ */ jsx(Text, {
					color: "gray",
					children: "Press Y or N, Enter accepts default."
				})]
			});
		};
		render(/* @__PURE__ */ jsx(Prompt, {}));
	});
}
function Spinner({ label }) {
	const frames = [
		"-",
		"\\",
		"|",
		"/"
	];
	const [index, setIndex] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => {
			setIndex((current) => (current + 1) % frames.length);
		}, 120);
		return () => clearInterval(timer);
	}, []);
	return /* @__PURE__ */ jsx(Text, { children: `${frames[index]} ${label}` });
}

//#endregion
//#region src/ui/login.tsx
async function pollLogin(baseUrl, payload, onStatus) {
	const expiresAt = new Date(payload.expiresAt).getTime();
	while (Date.now() < expiresAt) {
		await new Promise((resolve) => setTimeout(resolve, 2e3));
		onStatus("Waiting for login approval...");
		const poll = await fetch(`${baseUrl}/auth/cli-login/complete`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: payload.code })
		});
		if (!poll.ok) continue;
		const data = await poll.json();
		if (data.status === "complete" && data.token) return {
			token: data.token,
			projectId: data.projectId
		};
	}
	throw new Error("CLI login expired. Run `secrets login` again.");
}
function openLoginUrl(loginUrl) {
	import("node:child_process").then(({ exec }) => {
		const platform = process.platform;
		exec(platform === "darwin" ? `open "${loginUrl}"` : platform === "win32" ? `start "" "${loginUrl}"` : `xdg-open "${loginUrl}"`);
	}).catch(() => {});
}
async function runLoginUI(baseUrl, payload) {
	openLoginUrl(payload.loginUrl);
	return new Promise((resolve, reject) => {
		const LoginUI = () => {
			const { exit } = useApp();
			const [status, setStatus] = useState("Waiting for login approval...");
			const [error, setError] = useState(null);
			useEffect(() => {
				let isMounted = true;
				pollLogin(baseUrl, payload, (message) => {
					if (isMounted) setStatus(message);
				}).then((result) => {
					if (!isMounted) return;
					resolve(result);
					exit();
				}).catch((err) => {
					if (!isMounted) return;
					const message = err instanceof Error ? err.message : "Login failed";
					setError(message);
					reject(new Error(message));
					exit();
				});
				return () => {
					isMounted = false;
				};
			}, [exit]);
			useInput((input, key) => {
				if (key.ctrl && input === "c") {
					reject(/* @__PURE__ */ new Error("Aborted"));
					exit();
				}
			});
			return /* @__PURE__ */ jsxs(Box, {
				flexDirection: "column",
				gap: 1,
				children: [
					/* @__PURE__ */ jsx(Text, { children: "Open this URL to complete login:" }),
					/* @__PURE__ */ jsx(Text, {
						color: "cyan",
						children: payload.loginUrl
					}),
					/* @__PURE__ */ jsx(Text, { children: `Code: ${payload.code}` }),
					error ? /* @__PURE__ */ jsx(Text, {
						color: "red",
						children: error
					}) : /* @__PURE__ */ jsx(Spinner, { label: status }),
					/* @__PURE__ */ jsx(Text, {
						color: "gray",
						children: "Press Ctrl+C to cancel."
					})
				]
			});
		};
		render(/* @__PURE__ */ jsx(LoginUI, {}));
	});
}

//#endregion
//#region src/ui/init.tsx
async function runInitUI(projectFallback, envFallback, hasEnv) {
	const projectName = await promptText("Project name", projectFallback);
	const envName = await promptText("Environment name", envFallback);
	let importEnv = false;
	if (hasEnv) importEnv = await promptConfirm("Import .env into secrets?", true);
	return {
		projectName,
		envName,
		importEnv
	};
}

//#endregion
//#region src/index.ts
const DEFAULT_BASE_URL = "http://localhost:3001";
let globalDebugEnabled = false;
let lastBaseUrlHint;
function printHelp() {
	const lines = [
		"",
		"Secrets CLI",
		"",
		"Usage:",
		"  secrets run -- <command>",
		"  secrets export [--format dotenv] [--out <file>]",
		"  secrets login",
		"  secrets init",
		"  secrets list",
		"  secrets get <key>",
		"",
		"Environment variables:",
		"  SECRETS_TOKEN     API token (required)",
		"  SECRETS_ENV       Environment id or slug (required)",
		"  SECRETS_PROJECT   Project id or slug (required when env is a slug)",
		"  SECRETS_API_BASE_URL  API base URL (optional)",
		"",
		"Optional config file:",
		`  ${CONFIG_FILENAME}`,
		"",
		"Flags:",
		"  --env <value>         Environment id or slug",
		"  --project <value>     Project id or slug",
		"  --base-url <value>    API base URL",
		"  --override            Override existing env vars (run only)",
		"  --format dotenv       Export format (export only)",
		"  --out <file>          Write export to file (export only)",
		"  --dry-run             Show export output details without writing (export only)",
		"  --force               Overwrite existing files (export/init)",
		"  --project-name <value>  Project name (init only)",
		"  --env-name <value>      Environment name (init only)",
		"  --debug               Enable verbose diagnostic logs (stderr)",
		""
	];
	console.log(lines.join("\n"));
}
function parseFlags(args) {
	const flags = {};
	const rest = [];
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (!arg.startsWith("--")) {
			rest.push(arg);
			continue;
		}
		if (arg === "--override") {
			flags.override = true;
			continue;
		}
		if (arg === "--dry-run") {
			flags.dryRun = true;
			continue;
		}
		if (arg === "--force") {
			flags.force = true;
			continue;
		}
		if (arg === "--debug") {
			flags.debug = true;
			continue;
		}
		const [key, inlineValue] = arg.split("=");
		const value = inlineValue ?? args[i + 1];
		if (!value || inlineValue === void 0 && value.startsWith("--")) throw new Error(`Missing value for ${key}`);
		if (inlineValue === void 0) i += 1;
		switch (key) {
			case "--env":
				flags.env = value;
				break;
			case "--project":
				flags.project = value;
				break;
			case "--base-url":
				flags.baseUrl = value;
				break;
			case "--format":
				flags.format = value;
				break;
			case "--out":
				flags.out = value;
				break;
			case "--project-name":
				flags.projectName = value;
				break;
			case "--env-name":
				flags.envName = value;
				break;
			default: throw new Error(`Unknown flag: ${key}`);
		}
	}
	return {
		flags,
		rest
	};
}
function isDebugEnabled(flags) {
	if (flags.debug) return true;
	const value = process$1.env.SECRETS_DEBUG?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}
function normalizeGlobalArgs(args) {
	const separatorIndex = args.indexOf("--");
	const head = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
	const tail = separatorIndex === -1 ? [] : args.slice(separatorIndex);
	const filteredHead = head.filter((arg) => arg !== "--debug");
	return {
		args: [...filteredHead, ...tail],
		hasDebugFlag: filteredHead.length !== head.length
	};
}
function isDebugActive(flags) {
	return globalDebugEnabled || isDebugEnabled(flags);
}
async function loadClient(flags, logger) {
	const config = await readConfigFile();
	const token = process$1.env.SECRETS_TOKEN;
	if (!token) throw new Error("Missing SECRETS_TOKEN. Run `secrets login` or set the env var.");
	const baseUrl = flags.baseUrl ?? process$1.env.SECRETS_API_BASE_URL ?? config?.apiBaseUrl ?? DEFAULT_BASE_URL;
	lastBaseUrlHint = baseUrl;
	logger("client.resolve", {
		baseUrl,
		hasToken: Boolean(token),
		hasConfig: Boolean(config)
	});
	const envInput = flags.env ?? process$1.env.SECRETS_ENV;
	const projectInput = flags.project ?? process$1.env.SECRETS_PROJECT;
	const envSelection = normalizeConfigInput(envInput, config?.environmentId ?? config?.environmentSlug);
	const projectSelection = normalizeConfigInput(projectInput, config?.projectId ?? config?.projectSlug);
	if (!envSelection.id && !envSelection.slug) throw new Error("Missing SECRETS_ENV (or environment in config). Run `secrets init` or set SECRETS_ENV.");
	return {
		client: createClient({
			baseUrl,
			token,
			environmentId: envSelection.id,
			environmentSlug: envSelection.slug,
			projectId: projectSelection.id,
			projectSlug: projectSelection.slug
		}),
		baseUrl,
		token
	};
}
async function apiFetch(baseUrl, token, path, logger) {
	const startedAt = Date.now();
	logger("http.request", {
		method: "GET",
		path,
		baseUrl,
		headers: { Authorization: `Bearer ${token}` }
	});
	let response;
	try {
		response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
	} catch (error) {
		const err = error;
		logger("http.network_error", {
			method: "GET",
			path,
			message: err.message,
			name: err.name,
			cause: err.cause,
			durationMs: Date.now() - startedAt
		});
		throw error;
	}
	logger("http.response", {
		method: "GET",
		path,
		status: response.status,
		statusText: response.statusText,
		contentType: response.headers.get("content-type") ?? "",
		durationMs: Date.now() - startedAt
	});
	if (!response.ok) {
		let message = response.statusText;
		try {
			const payload = await response.json();
			if (payload?.error) message = payload.error;
			logger("http.response_error_payload", {
				method: "GET",
				path,
				payload
			});
		} catch {
			logger("http.response_error_payload_unavailable", {
				method: "GET",
				path
			});
		}
		throw new Error(message);
	}
	if ((response.headers.get("content-type") ?? "").includes("application/json")) return await response.json();
	return await response.text();
}
async function apiRequest(baseUrl, token, path, options, logger) {
	const headers = new Headers(options.headers);
	headers.set("Authorization", `Bearer ${token}`);
	if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
	const method = options.method ?? "GET";
	const startedAt = Date.now();
	logger("http.request", {
		method,
		path,
		baseUrl,
		headers: Object.fromEntries(headers.entries()),
		hasBody: Boolean(options.body),
		bodyPreview: typeof options.body === "string" ? options.body : void 0
	});
	let response;
	try {
		response = await fetch(`${baseUrl}${path}`, {
			...options,
			headers
		});
	} catch (error) {
		const err = error;
		logger("http.network_error", {
			method,
			path,
			message: err.message,
			name: err.name,
			cause: err.cause,
			durationMs: Date.now() - startedAt
		});
		throw error;
	}
	logger("http.response", {
		method,
		path,
		status: response.status,
		statusText: response.statusText,
		contentType: response.headers.get("content-type") ?? "",
		durationMs: Date.now() - startedAt
	});
	if (!response.ok) {
		let message = response.statusText;
		try {
			const payload = await response.json();
			if (payload?.error) message = payload.error;
			logger("http.response_error_payload", {
				method,
				path,
				payload
			});
		} catch {
			logger("http.response_error_payload_unavailable", {
				method,
				path
			});
		}
		throw new Error(message);
	}
	if ((response.headers.get("content-type") ?? "").includes("application/json")) return await response.json();
	return await response.text();
}
async function resolveBaseUrl(flags) {
	const config = await readConfigFile();
	const baseUrl = flags.baseUrl ?? process$1.env.SECRETS_API_BASE_URL ?? config?.apiBaseUrl ?? DEFAULT_BASE_URL;
	lastBaseUrlHint = baseUrl;
	return baseUrl;
}
async function loginCommand(args) {
	const { flags, rest } = parseFlags(args);
	if (rest.length > 0) throw new Error("Unexpected arguments for login command");
	const baseUrl = await resolveBaseUrl(flags);
	const logger = createDebugLogger(isDebugActive(flags));
	const startedAt = Date.now();
	logger("http.request", {
		method: "POST",
		path: "/auth/cli-login",
		baseUrl
	});
	let response;
	try {
		response = await fetch(`${baseUrl}/auth/cli-login`, { method: "POST" });
	} catch (error) {
		const err = error;
		logger("http.network_error", {
			method: "POST",
			path: "/auth/cli-login",
			message: err.message,
			name: err.name,
			cause: err.cause,
			durationMs: Date.now() - startedAt
		});
		throw error;
	}
	logger("http.response", {
		method: "POST",
		path: "/auth/cli-login",
		status: response.status,
		statusText: response.statusText,
		contentType: response.headers.get("content-type") ?? "",
		durationMs: Date.now() - startedAt
	});
	if (!response.ok) throw new Error(`Unable to start CLI login (${response.status})`);
	const result = await runLoginUI(baseUrl, await response.json());
	console.log("\nCLI token:");
	console.log(result.token);
	console.log("\nNext steps:");
	console.log("  export SECRETS_TOKEN=<token>");
	if (result.projectId) console.log(`  export SECRETS_PROJECT=${result.projectId}`);
	console.log("  secrets init");
}
async function initCommand(args) {
	const { flags, rest } = parseFlags(args);
	if (rest.length > 0) throw new Error("Unexpected arguments for init command");
	const token = process$1.env.SECRETS_TOKEN;
	if (!token) throw new Error("Missing SECRETS_TOKEN. Run `secrets login` first.");
	const baseUrl = await resolveBaseUrl(flags);
	const logger = createDebugLogger(isDebugActive(flags));
	const fs = await import("node:fs/promises");
	const path = await import("node:path");
	const configPath = path.join(process$1.cwd(), CONFIG_FILENAME);
	try {
		await fs.access(configPath);
		if (!flags.force) throw new Error(`Config file already exists at ${configPath}. Use --force to overwrite.`);
	} catch (error) {
		const err = error;
		if (err.code && err.code !== "ENOENT") throw error;
	}
	const cwdName = path.basename(process$1.cwd());
	const envPath = path.join(process$1.cwd(), ".env");
	let envExists = false;
	try {
		await fs.access(envPath);
		envExists = true;
	} catch {
		envExists = false;
	}
	const answers = await runInitUI(flags.projectName ?? cwdName, flags.envName ?? "dev", envExists);
	const projectName = answers.projectName;
	const envName = answers.envName;
	const project = await apiRequest(baseUrl, token, `/projects`, {
		method: "POST",
		body: JSON.stringify({ name: projectName })
	}, logger);
	const environment = await apiRequest(baseUrl, token, `/projects/${project.id}/environments`, {
		method: "POST",
		body: JSON.stringify({ name: envName })
	}, logger);
	const config = {
		apiBaseUrl: baseUrl,
		projectId: project.id,
		environmentId: environment.id
	};
	await fs.writeFile(configPath, JSON.stringify(config, null, 2));
	console.log(`Created ${CONFIG_FILENAME}`);
	if (envExists) {
		const gitignorePath = path.join(process$1.cwd(), ".gitignore");
		let gitignore = "";
		try {
			gitignore = await fs.readFile(gitignorePath, "utf-8");
		} catch {
			gitignore = "";
		}
		if (!gitignore.split(/\r?\n/).some((line) => {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) return false;
			if (trimmed.startsWith("!")) return false;
			return /^\.env$/.test(trimmed) || /^\.env\/$/.test(trimmed) || /^\.env\*$/.test(trimmed) || /^\.env\..+/.test(trimmed) || /^(?:\*\/|\*\*\/)\.env(\..+)?$/.test(trimmed) || /^(?:\*\/|\*\*\/)\.env\*$/.test(trimmed);
		})) console.warn("Warning: .env is not ignored in .gitignore (add .env, .env.*, or **/.env*).");
		if (answers.importEnv) {
			const entries = parseEnvFile(await fs.readFile(envPath, "utf-8"));
			const results = [];
			for (const entry of entries) {
				const result = await apiRequest(baseUrl, token, `/environments/${environment.id}/secrets`, {
					method: "POST",
					body: JSON.stringify(entry)
				}, logger);
				results.push(result ?? {});
			}
			const { created, pending } = summarizeImportResults(results);
			if (pending > 0) console.log(`Imported ${created} secrets from .env (pending approval: ${pending})`);
			else console.log(`Imported ${created} secrets from .env`);
		}
	} else console.log("No .env found in current directory.");
}
async function runCommand(args) {
	const separatorIndex = args.indexOf("--");
	if (separatorIndex === -1) throw new Error("Expected -- before command to run");
	const { flags } = parseFlags(args.slice(0, separatorIndex));
	const logger = createDebugLogger(isDebugActive(flags));
	const command = args.slice(separatorIndex + 1);
	if (command.length === 0) throw new Error("No command provided");
	const { client } = await loadClient(flags, logger);
	const secrets = await client.getSecrets();
	const env = { ...process$1.env };
	for (const [key, value] of Object.entries(secrets)) {
		if (!flags.override && typeof env[key] !== "undefined") continue;
		env[key] = value;
	}
	const child = spawn(command[0], command.slice(1), {
		stdio: "inherit",
		env
	});
	child.on("exit", (code) => {
		process$1.exit(code ?? 0);
	});
	child.on("error", (error) => {
		console.error(`Failed to run command: ${error.message}`);
		process$1.exit(1);
	});
}
async function exportEnv(args) {
	const { flags, rest } = parseFlags(args);
	const logger = createDebugLogger(isDebugActive(flags));
	if (rest.length > 0) throw new Error("Unexpected arguments for export command");
	if (flags.format && flags.format !== "dotenv") throw new Error("Only dotenv format is supported");
	const { client, baseUrl, token } = await loadClient(flags, logger);
	const output = await apiFetch(baseUrl, token, `/environments/${await client.resolveEnvironmentId()}/export?format=dotenv`, logger);
	if (flags.out) {
		const fs = await import("node:fs/promises");
		const resolved = (await import("node:path")).resolve(flags.out);
		if (!flags.force) try {
			await fs.access(resolved);
			throw new Error(`Output file exists: ${resolved}. Use --force to overwrite.`);
		} catch (error) {
			const err = error;
			if (err.code && err.code !== "ENOENT") throw error;
		}
		if (flags.dryRun) {
			console.log(`Dry run: would write ${output.length} bytes to ${resolved}`);
			return;
		}
		await fs.writeFile(resolved, output, "utf-8");
		return;
	}
	if (flags.dryRun) {
		console.log(`Dry run: would print ${output.length} bytes to stdout`);
		return;
	}
	process$1.stdout.write(output);
}
async function listSecrets(args) {
	const { flags, rest } = parseFlags(args);
	const logger = createDebugLogger(isDebugActive(flags));
	if (rest.length > 0) throw new Error("Unexpected arguments for list command");
	const { client, baseUrl, token } = await loadClient(flags, logger);
	const secrets = await apiFetch(baseUrl, token, `/environments/${await client.resolveEnvironmentId()}/secrets?includeValues=true`, logger);
	for (const secret of secrets) console.log(secret.key);
}
async function getSecret(args) {
	const { flags, rest } = parseFlags(args);
	const logger = createDebugLogger(isDebugActive(flags));
	const key = rest[0];
	if (!key) throw new Error("Secret key is required");
	const { client } = await loadClient(flags, logger);
	const value = await client.getSecret(key);
	if (typeof value === "undefined") throw new Error(`Secret not found or value not available: ${key}`);
	process$1.stdout.write(`${value}\n`);
}
async function main() {
	const normalized = normalizeGlobalArgs(process$1.argv.slice(2));
	const args = normalized.args;
	globalDebugEnabled = normalized.hasDebugFlag || isDebugEnabled({});
	const command = args[0];
	if (!command || command === "--help" || command === "-h") {
		printHelp();
		return;
	}
	switch (command) {
		case "run":
			await runCommand(args.slice(1));
			break;
		case "export":
			await exportEnv(args.slice(1));
			break;
		case "login":
			await loginCommand(args.slice(1));
			break;
		case "init":
			await initCommand(args.slice(1));
			break;
		case "list":
			await listSecrets(args.slice(1));
			break;
		case "get":
			await getSecret(args.slice(1));
			break;
		default: throw new Error(`Unknown command: ${command}`);
	}
}
main().catch((error) => {
	if (!globalDebugEnabled) console.error("Tip: rerun with --debug or set SECRETS_DEBUG=1 for diagnostics.");
	else {
		if (lastBaseUrlHint) console.error(`Debug context: SECRETS_API_BASE_URL resolved to ${lastBaseUrlHint}`);
		if (error instanceof Error && error.stack) console.error(error.stack);
	}
	console.error(error.message);
	process$1.exit(1);
});

//#endregion
export {  };