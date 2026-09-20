import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/auth/services/auth.service';

interface AdminNavItem {
  label: string;
  icon: string;
  path: string;
  exact?: boolean;
}

interface AdminNavSection {
  label: string;
  items: AdminNavItem[];
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  mobileNavOpen = false;
  currentSection = 'لوحة الإدارة';

  readonly navSections: AdminNavSection[] = [
    {
      label: 'المحتوى',
      items: [
        { label: 'الدروس', icon: 'play_lesson', path: '/admin/lessons' },
        { label: 'المناهج', icon: 'auto_stories', path: '/admin/curriculums' },
      ],
    },
    {
      label: 'الإدارة',
      items: [
        { label: 'المجموعات', icon: 'group_work', path: '/admin/groups' },
        { label: 'الطلاب', icon: 'school', path: '/admin/students' },
        { label: 'المشرفون', icon: 'supervisor_account', path: '/admin/supervisors' },
        { label: 'الاشتراكات', icon: 'credit_card', path: '/admin/subscriptions' },
      ],
    },
    {
      label: 'المتابعة',
      items: [
        { label: 'الملخصات الأسبوعية', icon: 'date_range', path: '/admin/weekly-summaries' },
        { label: 'التقارير', icon: 'analytics', path: '/admin/reports' },
      ],
    },
    {
      label: 'النظام',
      items: [{ label: 'الإعدادات', icon: 'settings', path: '/admin/settings' }],
    },
  ];

  constructor(
    public auth: AuthService,
    private router: Router,
  ) {
    this.syncSectionTitle(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.mobileNavOpen = false;
        this.syncSectionTitle(event.urlAfterRedirects);
      });
  }

  logout(): void {
    this.auth.logout();
  }

  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
  }

  private syncSectionTitle(url: string): void {
    if (url.includes('/lessons/')) {
      if (url.includes('/processing')) this.currentSection = 'معالجة محتوى الدرس';
      else if (url.includes('/content-review')) this.currentSection = 'مراجعة محتوى الدرس';
      else if (url.includes('/preview-shadowing')) this.currentSection = 'معاينة الدرس';
      else if (url.includes('/builder')) this.currentSection = 'منشئ الدرس';
      else this.currentSection = 'الدروس التعليمية';
      return;
    }

    if (url.endsWith('/lessons')) this.currentSection = 'الدروس التعليمية';
    else if (/\/curriculums\/[^/?#]+/.test(url)) this.currentSection = 'تفاصيل المنهج';
    else if (url.includes('/curriculums')) this.currentSection = 'المناهج التعليمية';
    else if (/\/groups\/[^/?#]+/.test(url)) this.currentSection = 'تفاصيل المجموعة';
    else if (url.includes('/groups')) this.currentSection = 'المجموعات';
    else if (url.includes('/students')) this.currentSection = 'الطلاب';
    else if (url.includes('/supervisors')) this.currentSection = 'المشرفون';
    else if (url.includes('/subscriptions')) this.currentSection = 'الاشتراكات';
    else if (url.includes('/weekly-summaries')) this.currentSection = 'الملخصات الأسبوعية';
    else if (url.includes('/reports')) this.currentSection = 'التقارير';
    else if (url.includes('/settings')) this.currentSection = 'الإعدادات';
    else this.currentSection = 'لوحة الإدارة';
  }
}
