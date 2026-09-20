import { Routes } from '@angular/router';
import { LoginPage } from './pages/login/login.page';

export const authRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginPage },
];
