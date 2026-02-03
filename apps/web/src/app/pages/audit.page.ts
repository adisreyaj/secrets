import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { AuditLogDto } from '@secrets/shared';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-audit',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="flex flex-col gap-8">
      <section class="panel p-8">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-muted">Audit</p>
            <h1 class="mt-2 text-3xl font-semibold">Activity trail</h1>
            <p class="mt-1 text-sm text-muted">Track changes across secrets and environments.</p>
          </div>
          <a class="btn-ghost" [routerLink]="['/projects', projectId()]">Back to project</a>
        </div>
      </section>

      <section class="card p-6">
        <div class="space-y-4">
          @for (log of logs(); track log.id) {
            <div class="flex flex-col gap-2 border-b border-border/60 pb-4">
              <div class="flex items-center justify-between">
                <p class="font-semibold">{{ log.action }}</p>
                <span class="text-xs text-muted">{{ log.createdAt | date: 'medium' }}</span>
              </div>
              <div class="text-sm text-muted">
                <span>{{ log.resourceType }}</span>
                @if (log.resourceId) {
                  <span> • {{ log.resourceId }}</span>
                }
              </div>
              @if (log.metadataJson) {
                <div class="text-xs text-muted">
                  {{ log.metadataJson | json }}
                </div>
              }
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
export class AuditPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  readonly projectId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('projectId') ?? '')),
    { initialValue: '' },
  );

  readonly auditResource = httpResource<AuditLogDto[]>(
    () => {
      const projectId = this.projectId();
      if (!projectId) {
        return undefined;
      }
      return this.api.buildRequest('/audit', { params: { projectId } });
    },
    { defaultValue: [] },
  );

  readonly actionError = signal('');
  readonly logs = computed(() => this.auditResource.value());
  readonly loadError = computed(() =>
    this.auditResource.error() ? 'Unable to load audit logs.' : '',
  );
  readonly errorMessage = computed(() => this.actionError() || this.loadError());
}
