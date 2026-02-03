export declare const CONFIG_FILENAME = ".secretsrc.json";
export interface SecretsConfigFile {
    apiBaseUrl?: string;
    projectId?: string;
    projectSlug?: string;
    environmentId?: string;
    environmentSlug?: string;
}
export interface SecretsClientOptions {
    baseUrl?: string;
    token: string;
    projectId?: string;
    projectSlug?: string;
    environmentId?: string;
    environmentSlug?: string;
    cacheTtlMs?: number;
}
export interface SecretsClient {
    getSecret: (key: string) => Promise<string | undefined>;
    getSecrets: () => Promise<Record<string, string>>;
    injectProcessEnv: (options?: {
        override?: boolean;
    }) => Promise<Record<string, string>>;
    resolveEnvironmentId: () => Promise<string>;
}
export declare function readConfigFile(configPath?: string): Promise<SecretsConfigFile | null>;
export declare function fromConfigFile(options: {
    token: string;
    configPath?: string;
    cacheTtlMs?: number;
}): Promise<SecretsClient>;
export declare function createClient(options: SecretsClientOptions): SecretsClient;
export declare function normalizeConfigInput(envValue?: string, configValue?: string): {
    id?: string;
    slug?: string;
};
