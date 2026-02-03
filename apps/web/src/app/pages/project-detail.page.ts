import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import type { EnvironmentDto, ProjectDto } from '@secrets/shared';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-project-detail',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex flex-col gap-8">
      <section class="panel p-8">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-muted">Project</p>
            @if (project()) {
              <h1 class="mt-2 text-3xl font-semibold">{{ project()?.name }}</h1>
            } @else {
              <h1 class="mt-2 text-3xl font-semibold">Loading...</h1>
            }
          </div>
          <div class="flex gap-3">
            <a class="btn-ghost" [routerLink]="['/projects', projectId(), 'audit']">Audit Log</a>
            <a class="btn-ghost" [routerLink]="['/projects', projectId(), 'tokens']">API Tokens</a>
          </div>
        </div>

        <div class="mt-6 flex flex-col gap-3 md:flex-row">
          <input
            class="input md:w-64"
            placeholder="New environment name"
            aria-label="New environment name"
            [formControl]="newEnvControl"
          />
          <button class="btn-primary" (click)="createEnvironment()" [disabled]="!canCreate()">
            Create environment
          </button>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2">
        @for (env of environments(); track env.id) {
          <a
            class="card block p-6 transition hover:-translate-y-1 hover:border-primary/60"
            [routerLink]="['/projects', projectId(), 'environments', env.id]"
          >
            <h2 class="text-xl font-semibold">{{ env.name }}</h2>
            <p class="mt-2 text-sm text-muted">Updated {{ env.updatedAt | date: 'medium' }}</p>
          </a>
        }
      </section>

      @if (errorMessage()) {
        <p class="text-sm text-danger" role="alert">{{ errorMessage() }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  readonly projectId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('projectId') ?? '')),
    { initialValue: '' },
  );

  readonly newEnvControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  readonly projectsResource = httpResource<ProjectDto[]>(
    () => this.api.buildRequest('/projects'),
    { defaultValue: [] },
  );

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

  private readonly actionError = signal('');
  readonly project = computed(
    () => this.projectsResource.value().find((item) => item.id === this.projectId()) ?? null,
  );
  readonly environments = computed(() => this.environmentsResource.value());
  readonly environmentCount = computed(() => this.environments().length);
  readonly projectError = computed(() =>
    this.projectsResource.error() ? 'Unable to load project.' : '',
  );
  readonly environmentsError = computed(() =>
    this.environmentsResource.error() ? 'Unable to load environments.' : '',
  );
  readonly errorMessage = computed(
    () => this.actionError() || this.projectError() || this.environmentsError(),
  );
  readonly canCreate = computed(() => this.newEnvControl.valid);

  async createEnvironment() {
    this.actionError.set('');
    if (this.newEnvControl.invalid) {
      this.newEnvControl.markAsTouched();
      return;
    }

    const projectId = this.projectId();
    const name = this.newEnvControl.value.trim();
    if (!projectId || !name) {
      return;
    }

    try {
      const env = await firstValueFrom(this.api.createEnvironment(projectId, { name }));
      this.environmentsResource.update((environments) => [env, ...environments]);
      this.newEnvControl.setValue('');
    } catch {
      this.actionError.set('Unable to create environment.');
    }
  }
}
