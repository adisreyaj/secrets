import fs from 'node:fs/promises';
import path from 'node:path';
export const CONFIG_FILENAME = '.secretsrc.json';
const DEFAULT_BASE_URL = 'http://localhost:3001';
async function apiFetch(baseUrl, token, path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
    });
    if (!response.ok) {
        let message = response.statusText;
        try {
            const payload = await response.json();
            if (payload?.error) {
                message = payload.error;
            }
        }
        catch {
            // ignore
        }
        throw new Error(`Secrets API error: ${message}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        return (await response.json());
    }
    return (await response.text());
}
function isProbablyId(value) {
    return /^c[a-z0-9]{20,}$/i.test(value);
}
export async function readConfigFile(configPath = path.join(process.cwd(), CONFIG_FILENAME)) {
    try {
        const raw = await fs.readFile(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch (error) {
        const err = error;
        if (err.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}
async function resolveProjectId(baseUrl, token, projectId, projectSlug) {
    if (projectId) {
        return projectId;
    }
    if (!projectSlug) {
        return undefined;
    }
    const project = await apiFetch(baseUrl, token, `/projects/slug/${projectSlug}`);
    return project.id;
}
async function resolveEnvironmentId(baseUrl, token, envId, envSlug, projectId, projectSlug) {
    if (envId) {
        return envId;
    }
    if (!envSlug) {
        throw new Error('Environment ID or slug is required');
    }
    const resolvedProjectId = await resolveProjectId(baseUrl, token, projectId, projectSlug);
    if (!resolvedProjectId) {
        throw new Error('Project ID or slug is required when environment is a slug');
    }
    const env = await apiFetch(baseUrl, token, `/projects/${resolvedProjectId}/environments/slug/${envSlug}`);
    return env.id;
}
export async function fromConfigFile(options) {
    const config = await readConfigFile(options.configPath);
    if (!config) {
        throw new Error(`Config file not found. Expected ${CONFIG_FILENAME} in the current directory.`);
    }
    return createClient({
        baseUrl: config.apiBaseUrl,
        token: options.token,
        projectId: config.projectId,
        projectSlug: config.projectSlug,
        environmentId: config.environmentId,
        environmentSlug: config.environmentSlug,
        cacheTtlMs: options.cacheTtlMs,
    });
}
export function createClient(options) {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const cacheTtlMs = options.cacheTtlMs ?? 0;
    let cache;
    const resolveEnvId = async () => resolveEnvironmentId(baseUrl, options.token, options.environmentId, options.environmentSlug, options.projectId, options.projectSlug);
    const getSecrets = async () => {
        if (cache && cacheTtlMs > 0 && Date.now() - cache.fetchedAt < cacheTtlMs) {
            return cache.data;
        }
        const envId = await resolveEnvId();
        const secrets = await apiFetch(baseUrl, options.token, `/environments/${envId}/secrets?includeValues=true`);
        const data = {};
        for (const secret of secrets) {
            if (typeof secret.value === 'string') {
                data[secret.key] = secret.value;
            }
        }
        cache = { fetchedAt: Date.now(), data };
        return data;
    };
    const getSecret = async (key) => {
        const data = await getSecrets();
        return data[key];
    };
    const injectProcessEnv = async (opts) => {
        const data = await getSecrets();
        const override = opts?.override === true;
        for (const [key, value] of Object.entries(data)) {
            if (!override && typeof process.env[key] !== 'undefined') {
                continue;
            }
            process.env[key] = value;
        }
        return data;
    };
    return {
        getSecret,
        getSecrets,
        injectProcessEnv,
        resolveEnvironmentId: resolveEnvId,
    };
}
export function normalizeConfigInput(envValue, configValue) {
    const value = envValue ?? configValue;
    if (!value) {
        return {};
    }
    if (isProbablyId(value)) {
        return { id: value };
    }
    return { slug: value };
}
