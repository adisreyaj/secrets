import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import type { ApiTokenDto } from '@secrets/shared';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-tokens',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex flex-col gap-8">
      <section class="panel p-8">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-muted">API Tokens</p>
            <h1 class="mt-2 text-3xl font-semibold">Programmatic access</h1>
            <p class="mt-1 text-sm text-muted">Generate one-time tokens for CI/CD or scripts.</p>
          </div>
          <a class="btn-ghost" [routerLink]="['/projects', projectId()]">Back to project</a>
        </div>

        <div class="mt-6 flex flex-col gap-3 md:flex-row">
          <input
            class="input md:w-64"
            placeholder="Token name"
            aria-label="Token name"
            [formControl]="newNameControl"
          />
          <button class="btn-primary" (click)="createToken()" [disabled]="!canCreate()">
            Create token
          </button>
        </div>

        @if (lastToken()) {
          <div class="mt-6 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
            <p class="font-semibold">Copy this token now. It won't be shown again.</p>
            <p class="mt-2 break-all text-primary">{{ lastToken() }}</p>
          </div>
        }
      </section>

      <section class="card p-6">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Active tokens</h2>
          <span class="badge">{{ tokenCount() }} total</span>
        </div>

        <div class="mt-6 space-y-3">
          @for (token of tokens(); track token.id) {
            <div class="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <p class="font-medium">{{ token.name }}</p>
                <p class="text-xs text-muted">Created {{ token.createdAt | date: 'medium' }}</p>
              </div>
              <p class="text-xs text-muted">
                Last used {{ token.lastUsedAt ? (token.lastUsedAt | date: 'medium') : 'never' }}
              </p>
            </div>
          }
        </div>
      </section>

      @if (errorMessage()) {
        <p class="text-sm text-danger" role="alert">{{ errorMessage() }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokensPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  readonly projectId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('projectId') ?? '')),
    { initialValue: '' },
  );

  readonly newNameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  readonly tokensResource = httpResource<ApiTokenDto[]>(
    () => {
      const projectId = this.projectId();
      if (!projectId) {
        return undefined;
      }
      return this.api.buildRequest(`/projects/${projectId}/api-tokens`);
    },
    { defaultValue: [] },
  );

  private readonly actionError = signal('');
  readonly lastToken = signal('');
  readonly tokens = computed(() => this.tokensResource.value());
  readonly tokenCount = computed(() => this.tokens().length);
  readonly loadError = computed(() =>
    this.tokensResource.error() ? 'Unable to load tokens.' : '',
  );
  readonly errorMessage = computed(() => this.actionError() || this.loadError());
  readonly canCreate = computed(() => this.newNameControl.valid);

  async createToken() {
    this.actionError.set('');
    if (this.newNameControl.invalid) {
      this.newNameControl.markAsTouched();
      return;
    }

    const projectId = this.projectId();
    const name = this.newNameControl.value.trim();
    if (!projectId || !name) {
      return;
    }

    try {
      const response = await firstValueFrom(this.api.createToken(projectId, { name }));
      this.lastToken.set(response.token);
      this.tokensResource.update((tokens) => [response.tokenMeta, ...tokens]);
      this.newNameControl.setValue('');
    } catch {
      this.actionError.set('Unable to create token.');
    }
  }
}
