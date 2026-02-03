import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'projects' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'projects',
    loadComponent: () => import('./pages/projects.page').then((m) => m.ProjectsPage),
  },
  {
    path: 'projects/:projectId',
    loadComponent: () => import('./pages/project-detail.page').then((m) => m.ProjectDetailPage),
  },
  {
    path: 'projects/:projectId/environments/:envId',
    loadComponent: () => import('./pages/environment.page').then((m) => m.EnvironmentPage),
  },
  {
    path: 'projects/:projectId/audit',
    loadComponent: () => import('./pages/audit.page').then((m) => m.AuditPage),
  },
  {
    path: 'projects/:projectId/tokens',
    loadComponent: () => import('./pages/tokens.page').then((m) => m.TokensPage),
  },
];
