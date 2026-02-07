//#region src/env.d.ts
type EnvEntry = {
  key: string;
  value: string;
};
declare function parseEnvFile(content: string): EnvEntry[];
declare function summarizeImportResults(results: {
  status?: string;
}[]): {
  created: number;
  pending: number;
};
//#endregion
export { EnvEntry, parseEnvFile, summarizeImportResults };