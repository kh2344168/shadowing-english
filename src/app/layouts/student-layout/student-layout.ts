import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faArrowRightFromBracket,
  faBookOpen,
  faChartSimple,
  faHouse,
  faLayerGroup,
  faRepeat,
  faUser,
  faWaveSquare,
} from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../core/auth/services/auth.service';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-student-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FontAwesomeModule],
  templateUrl: './student-layout.html',
  styleUrl: './student-layout.scss',
})
export class StudentLayout implements OnDestroy {
  readonly icons = {
    brand: faWaveSquare,
    home: faHouse,
    weeks: faLayerGroup,
    review: faRepeat,
    bank: faBookOpen,
    progress: faChartSimple,
    profile: faUser,
    logout: faArrowRightFromBracket,
  };

  accountOpen = false;
  private readonly navigationSubscription: Subscription;

  constructor(
    public auth: AuthService,
    router: Router,
  ) {
    this.navigationSubscription = router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  }

  ngOnDestroy(): void {
    this.navigationSubscription.unsubscribe();
  }

  get initial(): string {
    return (this.auth.currentUser?.name || 'ط').charAt(0).toUpperCase();
  }

  toggleAccount(): void {
    this.accountOpen = !this.accountOpen;
  }

  logout(): void {
    this.auth.logout();
  }
}
