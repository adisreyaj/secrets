//#region src/log.d.ts
type DebugData = Record<string, unknown>;
type DebugLogger = (event: string, data?: DebugData) => void;
declare function redactDebugData(data?: DebugData): DebugData | undefined;
declare function createDebugLogger(enabled: boolean): DebugLogger;
//#endregion
export { DebugData, DebugLogger, createDebugLogger, redactDebugData };