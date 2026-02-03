import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, tap } from 'rxjs';
import type { UserDto } from '@secrets/shared';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly userSignal = signal<UserDto | null>(null);

  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.userSignal());

  loadMe() {
    return this.api.getMe().pipe(
      map((response) => response.user),
      tap((user) => this.userSignal.set(user)),
      catchError(() => {
        this.userSignal.set(null);
        return of(null);
      }),
    );
  }

  register(email: string, password: string, name?: string) {
    return this.api.register({ email, password, name }).pipe(
      map((response) => response.user),
      tap((user) => this.userSignal.set(user)),
    );
  }

  login(email: string, password: string) {
    return this.api.login({ email, password }).pipe(
      map((response) => response.user),
      tap((user) => this.userSignal.set(user)),
    );
  }

  logout() {
    return this.api.logout().pipe(tap(() => this.userSignal.set(null)));
  }
}
