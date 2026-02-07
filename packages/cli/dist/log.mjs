import process from "node:process";

//#region src/log.ts
const REDACTED = "[REDACTED]";
const MAX_STRING_LENGTH = 2048;
function shouldRedactKey(key) {
	const normalized = key.toLowerCase();
	return normalized === "authorization" || normalized === "cookie" || normalized.includes("token") || normalized.includes("secret") || normalized.includes("api-key") || normalized.includes("apikey");
}
function truncateString(value) {
	if (value.length <= MAX_STRING_LENGTH) return value;
	return `${value.slice(0, MAX_STRING_LENGTH)}... (truncated ${value.length - MAX_STRING_LENGTH} chars)`;
}
function redactValue(value) {
	if (typeof value === "string") return truncateString(value);
	if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
	if (value && typeof value === "object") {
		const entries = Object.entries(value);
		const redacted = {};
		for (const [key, entry] of entries) if (shouldRedactKey(key)) redacted[key] = REDACTED;
		else redacted[key] = redactValue(entry);
		return redacted;
	}
	return value;
}
function redactDebugData(data) {
	if (!data) return;
	return redactValue(data);
}
function createDebugLogger(enabled) {
	if (!enabled) return () => {};
	return (event, data) => {
		const timestamp = (/* @__PURE__ */ new Date()).toISOString();
		const payload = redactDebugData(data);
		if (payload) {
			process.stderr.write(`[debug ${timestamp}] ${event} ${JSON.stringify(payload)}\n`);
			return;
		}
		process.stderr.write(`[debug ${timestamp}] ${event}\n`);
	};
}

//#endregion
export { createDebugLogger, redactDebugData };