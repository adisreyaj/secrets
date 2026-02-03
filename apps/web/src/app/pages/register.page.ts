import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <div class="card p-8">
        <div class="mb-6">
          <p class="text-sm uppercase tracking-[0.3em] text-muted">Create account</p>
          <h1 class="mt-2 text-3xl font-semibold">Start securing secrets</h1>
          <p class="mt-2 text-sm text-muted">Create your workspace in seconds.</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="text-xs uppercase tracking-widest text-muted" for="register-name">Name</label>
            <input
              class="input mt-2"
              type="text"
              id="register-name"
              name="name"
              formControlName="name"
              autocomplete="name"
            />
          </div>
          <div>
            <label class="text-xs uppercase tracking-widest text-muted" for="register-email">Email</label>
            <input
              class="input mt-2"
              type="email"
              id="register-email"
              name="email"
              formControlName="email"
              autocomplete="email"
              required
            />
          </div>
          <div>
            <label class="text-xs uppercase tracking-widest text-muted" for="register-password"
              >Password</label
            >
            <input
              class="input mt-2"
              type="password"
              id="register-password"
              name="password"
              formControlName="password"
              autocomplete="new-password"
              required
            />
          </div>

          @if (error()) {
            <p class="text-sm text-danger" role="alert">{{ error() }}</p>
          }

          <button class="btn-primary w-full" type="submit" [disabled]="!canSubmit()">
            Create account
          </button>
        </form>

        <p class="mt-6 text-sm text-muted">
          Already have an account?
          <a class="text-primary hover:underline" routerLink="/login">Sign in</a>
        </p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly form = this.fb.group({
    name: this.fb.control(''),
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
      const { name, email, password } = this.form.getRawValue();
      await firstValueFrom(this.auth.register(email, password, name || undefined));
      await this.router.navigateByUrl('/projects');
    } catch {
      this.error.set('Unable to create account. Try a different email.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
