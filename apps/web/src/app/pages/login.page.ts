import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <div class="card p-8">
        <div class="mb-6">
          <p class="text-sm uppercase tracking-[0.3em] text-muted">Welcome back</p>
          <h1 class="mt-2 text-3xl font-semibold">Sign in</h1>
          <p class="mt-2 text-sm text-muted">Access your projects and secrets.</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="text-xs uppercase tracking-widest text-muted" for="login-email">Email</label>
            <input
              class="input mt-2"
              type="email"
              id="login-email"
              name="email"
              formControlName="email"
              autocomplete="email"
              required
            />
          </div>
          <div>
            <label class="text-xs uppercase tracking-widest text-muted" for="login-password"
              >Password</label
            >
            <input
              class="input mt-2"
              type="password"
              id="login-password"
              name="password"
              formControlName="password"
              autocomplete="current-password"
              required
            />
          </div>

          @if (error()) {
            <p class="text-sm text-danger" role="alert">{{ error() }}</p>
          }

          <button class="btn-primary w-full" type="submit" [disabled]="!canSubmit()">
            Sign in
          </button>
        </form>

        <p class="mt-6 text-sm text-muted">
          New here?
          <a class="text-primary hover:underline" routerLink="/register">Create an account</a>
        </p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly form = this.fb.group({
    email: this.fb.control('', {
      validators: [Validators.required, Validators.email],
    }),
    password: this.fb.control('', {
      validators: [Validators.required],
    }),
  });

  readonly error = signal('');
  readonly isSubmitting = signal(false);
  readonly canSubmit = computed(() => this.form.valid && !this.isSubmitting());

  async submit() {
    if (this.isSubmitting()) {
      return;
    }

    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await firstValueFrom(this.auth.login(email, password));
      await this.router.navigateByUrl('/projects');
    } catch {
      this.error.set('Unable to sign in. Check your credentials.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
