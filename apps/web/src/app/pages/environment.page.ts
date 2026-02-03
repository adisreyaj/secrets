import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormRecord,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import type { EnvironmentDto, SecretDto } from '@secrets/shared';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-environment',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex flex-col gap-8">
      <section class="panel p-8">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-muted">Environment</p>
            @if (environment()) {
              <h1 class="mt-2 text-3xl font-semibold">{{ environment()?.name }}</h1>
            } @else {
              <h1 class="mt-2 text-3xl font-semibold">Loading...</h1>
            }
            <p class="mt-2 text-sm text-muted">Manage secrets and export .env</p>
          </div>
          <div class="flex gap-3">
            <button class="btn-ghost" (click)="toggleValues()">{{ toggleLabel() }}</button>
            <button class="btn-primary" (click)="downloadDotenv()">Download .env</button>
          </div>
        </div>

        <form [formGroup]="newSecretForm" class="mt-6 grid gap-3 md:grid-cols-3" (ngSubmit)="createSecret()">
          <input
            class="input"
            placeholder="Key"
            aria-label="Secret key"
            formControlName="key"
            required
          />
          <input
            class="input"
            placeholder="Value"
            aria-label="Secret value"
            formControlName="value"
            required
          />
          <button class="btn-primary" type="submit" [disabled]="!canCreateSecret()">Add secret</button>
        </form>
      </section>

      <section class="card p-6">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Secrets</h2>
          <span class="badge">{{ secretCount() }} total</span>
        </div>

        <div class="mt-6 overflow-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-muted">
              <tr>
                <th class="pb-3" scope="col">Key</th>
                <th class="pb-3" scope="col">Value</th>
                <th class="pb-3" scope="col">Updated</th>
                <th class="pb-3" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody class="text-text">
              @for (secret of secrets(); track secret.id) {
                <tr class="border-t border-border/60">
                  <td class="py-3 font-medium">{{ secret.key }}</td>
                  <td class="py-3">
                    <input
                      class="input"
                      [placeholder]="includeValues() ? 'Value' : 'Hidden'"
                      [attr.aria-label]="'Update value for ' + secret.key"
                      [formControl]="secretControl(secret.id)"
                    />
                    @if (includeValues() && secret.value) {
                      <p class="mt-1 text-xs text-muted">Current: {{ secret.value }}</p>
                    }
                  </td>
                  <td class="py-3 text-muted">{{ secret.updatedAt | date: 'short' }}</td>
                  <td class="py-3">
                    <div class="flex flex-col gap-2">
                      <button class="btn-ghost" (click)="updateSecret(secret)">Update</button>
                      <button class="btn-ghost" (click)="rollbackSecret(secret)">Rollback</button>
                      <button class="btn-ghost text-danger" (click)="deleteSecret(secret)">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      @if (errorMessage()) {
        <p class="text-sm text-danger" role="alert">{{ errorMessage() }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly projectId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('projectId') ?? '')),
    { initialValue: '' },
  );
  readonly envId = toSignal(this.route.paramMap.pipe(map((params) => params.get('envId') ?? '')), {
    initialValue: '',
  });

  readonly includeValues = signal(false);
  readonly newSecretForm = this.fb.group({
    key: this.fb.control('', { validators: [Validators.required] }),
    value: this.fb.control('', { validators: [Validators.required] }),
  });
  readonly secretEdits = new FormRecord<FormControl<string>>({});

  readonly environmentsResource = httpResource<EnvironmentDto[]>(
    () => {
      const projectId = this.projectId();
      if (!projectId) {
        return undefined;
      }
      return this.api.buildRequest(`/projects/${projectId}/environments`);
    },
    { defaultValue: [] },
  );

  readonly secretsResource = httpResource<SecretDto[]>(
    () => {
      const envId = this.envId();
      if (!envId) {
        return undefined;
      }
      return this.api.buildRequest(`/environments/${envId}/secrets`, {
        params: { includeValues: this.includeValues() },
      });
    },
    { defaultValue: [] },
  );

  private readonly actionError = signal('');
  readonly environment = computed(
    () => this.environmentsResource.value().find((env) => env.id === this.envId()) ?? null,
  );
  readonly secrets = computed(() => this.secretsResource.value());
  readonly secretCount = computed(() => this.secrets().length);
  readonly toggleLabel = computed(() => (this.includeValues() ? 'Hide values' : 'Show values'));
  readonly loadError = computed(() => {
    if (this.environmentsResource.error()) {
      return 'Unable to load environment.';
    }
    if (this.secretsResource.error()) {
      return 'Unable to load secrets.';
    }
    return '';
  });
  readonly errorMessage = computed(() => this.actionError() || this.loadError());
  readonly canCreateSecret = computed(() => this.newSecretForm.valid);

  secretControl(secretId: string) {
    const existing = this.secretEdits.controls[secretId];
    if (existing) {
      return existing;
    }

    const control = new FormControl('', { nonNullable: true });
    this.secretEdits.addControl(secretId, control);
    return control;
  }

  toggleValues() {
    this.includeValues.update((current) => !current);
  }

  async createSecret() {
    this.actionError.set('');
    if (this.newSecretForm.invalid) {
      this.newSecretForm.markAllAsTouched();
      return;
    }

    const envId = this.envId();
    const { key, value } = this.newSecretForm.getRawValue();
    const trimmedKey = key.trim();
    if (!envId || !trimmedKey) {
      return;
    }

    try {
      await firstValueFrom(this.api.createSecret(envId, { key: trimmedKey, value }));
      this.newSecretForm.reset({ key: '', value: '' });
      this.secretsResource.reload();
    } catch {
      this.actionError.set('Unable to create secret.');
    }
  }

  async updateSecret(secret: SecretDto) {
    this.actionError.set('');
    const control = this.secretEdits.controls[secret.id];
    const nextValue = control?.value.trim();
    if (!nextValue) {
      return;
    }

    try {
      await firstValueFrom(this.api.updateSecret(secret.id, { value: nextValue }));
      control.setValue('');
      this.secretsResource.reload();
    } catch {
      this.actionError.set('Unable to update secret.');
    }
  }

  async rollbackSecret(secret: SecretDto) {
    this.actionError.set('');
    try {
      await firstValueFrom(this.api.rollbackSecret(secret.id, {}));
      this.secretsResource.reload();
    } catch {
      this.actionError.set('Unable to rollback secret.');
    }
  }

  async deleteSecret(secret: SecretDto) {
    this.actionError.set('');
    try {
      await firstValueFrom(this.api.deleteSecret(secret.id));
      this.secretsResource.reload();
    } catch {
      this.actionError.set('Unable to delete secret.');
    }
  }

  async downloadDotenv() {
    this.actionError.set('');
    try {
      const content = await firstValueFrom(this.api.exportDotenv(this.envId()));
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.environment()?.name ?? 'secrets'}.env`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      this.actionError.set('Unable to export .env.');
    }
  }
}
