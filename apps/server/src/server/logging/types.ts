export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogCategory =
  | 'auth'
  | 'validation'
  | 'conflict'
  | 'rate_limit'
  | 'internal'
  | 'domain'
  | 'security';

export type RequestAuthContext = {
  userId: string | null;
  serviceAccountId: string | null;
  projectId: string | null;
  viaToken: boolean;
  tokenScopeType: string | null;
};

export type RequestLogContext = {
  requestId: string;
  method: string;
  url: string;
  route: string;
  statusCode?: number;
  ip: string;
  auth: RequestAuthContext | null;
};

export type StructuredLogEvent = {
  event: string;
  message: string;
  level: LogLevel;
  category: LogCategory;
  timestamp: string;
  context?: RequestLogContext;
  data?: Record<string, unknown>;
  err?: unknown;
};

export type LogSinkInitContext = {
  service: string;
  env: string;
  now: () => Date;
};

export type LogSink = {
  init?: (context: LogSinkInitContext) => void | Promise<void>;
  write: (event: StructuredLogEvent) => void | Promise<void>;
  flush?: () => Promise<void>;
};
