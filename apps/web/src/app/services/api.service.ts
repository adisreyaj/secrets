import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AddMemberRequest,
  ApiTokenDto,
  AuditLogDto,
  AuthResponse,
  CreateEnvironmentRequest,
  CreateProjectRequest,
  CreateSecretRequest,
  CreateTokenRequest,
  CreateTokenResponse,
  EnvironmentDto,
  LoginRequest,
  ProjectDto,
  RegisterRequest,
  RollbackSecretRequest,
  SecretDto,
  UpdateSecretRequest,
} from '@secrets/shared';

type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  params?:
    | HttpParams
    | Record<string, string | number | boolean | ReadonlyArray<string | number | boolean>>;
  headers?: HttpHeaders | Record<string, string | ReadonlyArray<string>>;
  context?: HttpContext;
  reportProgress?: boolean;
  withCredentials?: boolean;
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3001';

  private url(path: string) {
    return `${this.baseUrl}${path}`;
  }

  buildRequest(path: string, options: ApiRequestOptions = {}) {
    return {
      url: this.url(path),
      withCredentials: true,
      ...options,
    };
  }

  register(payload: RegisterRequest) {
    return this.http.post<AuthResponse>(this.url('/auth/register'), payload, {
      withCredentials: true,
    });
  }

  login(payload: LoginRequest) {
    return this.http.post<AuthResponse>(this.url('/auth/login'), payload, {
      withCredentials: true,
    });
  }

  logout() {
    return this.http.post<{ ok: boolean }>(this.url('/auth/logout'), {}, { withCredentials: true });
  }

  getMe() {
    return this.http.get<AuthResponse>(this.url('/me'), { withCredentials: true });
  }

  listProjects() {
    return this.http.get<ProjectDto[]>(this.url('/projects'), { withCredentials: true });
  }

  createProject(payload: CreateProjectRequest) {
    return this.http.post<ProjectDto>(this.url('/projects'), payload, { withCredentials: true });
  }

  addMember(projectId: string, payload: AddMemberRequest) {
    return this.http.post(this.url(`/projects/${projectId}/members`), payload, {
      withCredentials: true,
    });
  }

  listEnvironments(projectId: string) {
    return this.http.get<EnvironmentDto[]>(this.url(`/projects/${projectId}/environments`), {
      withCredentials: true,
    });
  }

  createEnvironment(projectId: string, payload: CreateEnvironmentRequest) {
    return this.http.post<EnvironmentDto>(
      this.url(`/projects/${projectId}/environments`),
      payload,
      {
        withCredentials: true,
      },
    );
  }

  listSecrets(environmentId: string, includeValues: boolean) {
    return this.http.get<SecretDto[]>(
      this.url(`/environments/${environmentId}/secrets?includeValues=${includeValues}`),
      { withCredentials: true },
    );
  }

  createSecret(environmentId: string, payload: CreateSecretRequest) {
    return this.http.post(this.url(`/environments/${environmentId}/secrets`), payload, {
      withCredentials: true,
    });
  }

  updateSecret(secretId: string, payload: UpdateSecretRequest) {
    return this.http.patch(this.url(`/secrets/${secretId}`), payload, { withCredentials: true });
  }

  rollbackSecret(secretId: string, payload: RollbackSecretRequest) {
    return this.http.post(this.url(`/secrets/${secretId}/rollback`), payload, {
      withCredentials: true,
    });
  }

  deleteSecret(secretId: string) {
    return this.http.delete(this.url(`/secrets/${secretId}`), { withCredentials: true });
  }

  exportDotenv(environmentId: string) {
    return this.http.get(this.url(`/environments/${environmentId}/export?format=dotenv`), {
      withCredentials: true,
      responseType: 'text',
    });
  }

  listAudit(projectId: string) {
    return this.http.get<AuditLogDto[]>(this.url(`/audit?projectId=${projectId}`), {
      withCredentials: true,
    });
  }

  createToken(projectId: string, payload: CreateTokenRequest) {
    return this.http.post<CreateTokenResponse>(
      this.url(`/projects/${projectId}/api-tokens`),
      payload,
      {
        withCredentials: true,
      },
    );
  }

  listTokens(projectId: string) {
    return this.http.get<ApiTokenDto[]>(this.url(`/projects/${projectId}/api-tokens`), {
      withCredentials: true,
    });
  }
}
