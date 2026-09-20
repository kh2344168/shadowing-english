import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faChartLine,
  faFileExport,
  faHouse,
  faMessage,
  faMicrophone,
  faMoneyCheckDollar,
  faRightFromBracket,
  faUserGroup,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../core/auth/services/auth.service';

@Component({
  selector: 'app-supervisor-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FontAwesomeModule],
  templateUrl: './supervisor-layout.html',
  styleUrl: './supervisor-layout.scss',
})
export class SupervisorLayout {
  readonly icons = {
    home: faHouse,
    students: faUsers,
    groups: faUserGroup,
    progress: faChartLine,
    subscriptions: faMoneyCheckDollar,
    summaries: faMicrophone,
    messages: faMessage,
    reports: faFileExport,
    logout: faRightFromBracket,
  };

  constructor(public auth: AuthService) {}

  logout(): void {
    this.auth.logout();
  }
}
