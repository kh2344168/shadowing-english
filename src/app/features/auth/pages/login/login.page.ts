import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  email = 'khaled.demo@example.com';
  password = '123456';
  rememberMe = true;
  showPassword = false;
  error = '';
  notice = '';
  submitting = false;

  constructor(private auth: AuthService) {}

  async login(): Promise<void> {
    this.notice = '';
    this.submitting = true;
    try {
      const result = await this.auth.login(this.email, this.password);
      this.error = result.ok ? '' : result.message;
    } finally {
      this.submitting = false;
    }
  }

  useAdminDemo(): void {
    this.loginWithDemo('admin@demo.com');
  }

  useSupervisorDemo(): void {
    this.loginWithDemo('supervisor@demo.com');
  }

  useTeacherDemo(): void {
    this.loginWithDemo('teacher@demo.com');
  }

  useStudentDemo(): void {
    this.loginWithDemo('khaled.demo@example.com');
  }

  showPasswordHelp(): void {
    this.error = '';
    this.notice = 'اطلب من مشرف مجموعتك إعادة تعيين كلمة المرور.';
  }

  private fillDemo(email: string): void {
    this.email = email;
    this.password = '123456';
    this.error = '';
    this.notice = '';
  }

  private loginWithDemo(email: string): void {
    this.fillDemo(email);
    void this.login();
  }
}
