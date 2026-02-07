//#region src/env.ts
function parseEnvFile(content) {
	const lines = content.split(/\r?\n/);
	const items = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const index = trimmed.indexOf("=");
		if (index <= 0) continue;
		const key = trimmed.slice(0, index).trim();
		let value = trimmed.slice(index + 1).trim();
		if (value.startsWith("\"") && value.endsWith("\"")) value = value.slice(1, -1).replace(/\\"/g, "\"");
		items.push({
			key,
			value
		});
	}
	return items;
}
function summarizeImportResults(results) {
	let created = 0;
	let pending = 0;
	for (const result of results) if (result?.status === "pending") pending += 1;
	else created += 1;
	return {
		created,
		pending
	};
}

//#endregion
export { parseEnvFile, summarizeImportResults };