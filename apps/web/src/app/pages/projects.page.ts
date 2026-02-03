import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ProjectDto } from '@secrets/shared';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-projects',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex flex-col gap-8">
      <section class="panel p-8">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 class="text-3xl font-semibold">Projects</h1>
            <p class="mt-1 text-sm text-muted">Organize secrets by product or environment.</p>
          </div>
          <div class="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <input
              class="input md:w-64"
              placeholder="New project name"
              aria-label="New project name"
              [formControl]="newProjectControl"
            />
            <button class="btn-primary" (click)="createProject()" [disabled]="!canCreate()">
              Create
            </button>
          </div>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2">
        @for (project of projects(); track project.id) {
          <a
            class="card block p-6 transition hover:-translate-y-1 hover:border-primary/60"
            [routerLink]="['/projects', project.id]"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-semibold">{{ project.name }}</h2>
              @if (project.role) {
                <span class="badge">{{ project.role }}</span>
              }
            </div>
            <p class="mt-3 text-sm text-muted">Updated {{ project.updatedAt | date: 'medium' }}</p>
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
export class ProjectsPage {
  private readonly api = inject(ApiService);

  readonly newProjectControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  readonly projectsResource = httpResource<ProjectDto[]>(
    () => this.api.buildRequest('/projects'),
    {
      defaultValue: [],
    },
  );

  private readonly actionError = signal('');
  readonly projects = computed(() => this.projectsResource.value());
  readonly projectCount = computed(() => this.projects().length);
  readonly loadError = computed(() =>
    this.projectsResource.error() ? 'Unable to load projects. Sign in again if needed.' : '',
  );
  readonly errorMessage = computed(() => this.actionError() || this.loadError());
  readonly canCreate = computed(() => this.newProjectControl.valid);

  async createProject() {
    this.actionError.set('');
    if (this.newProjectControl.invalid) {
      this.newProjectControl.markAsTouched();
      return;
    }

    const name = this.newProjectControl.value.trim();
    if (!name) {
      this.newProjectControl.setValue('');
      return;
    }

    try {
      const created = await firstValueFrom(this.api.createProject({ name }));
      this.projectsResource.update((projects) => [created, ...projects]);
      this.newProjectControl.setValue('');
    } catch {
      this.actionError.set('Unable to create project.');
    }
  }
}
