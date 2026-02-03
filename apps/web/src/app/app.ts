import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly displayName = computed(() => {
    const user = this.user();
    return user?.name || user?.email || '';
  });
  readonly isSignedIn = computed(() => !!this.user());

  async ngOnInit() {
    await firstValueFrom(this.auth.loadMe());
  }

  async logout() {
    await firstValueFrom(this.auth.logout());
    await this.router.navigateByUrl('/login');
  }
}
