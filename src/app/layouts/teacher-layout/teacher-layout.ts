import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faBookOpen,
  faGraduationCap,
  faHouse,
  faLayerGroup,
  faChartLine,
  faRightFromBracket,
  faUserGroup,
} from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../core/auth/services/auth.service';

@Component({
  selector: 'app-teacher-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FontAwesomeModule,
  ],
  templateUrl: './teacher-layout.html',
  styleUrl: './teacher-layout.scss',
})
export class TeacherLayout {
  readonly icons = {
    home: faHouse,
    lessons: faBookOpen,
    curriculum: faLayerGroup,
    groups: faUserGroup,
    students: faGraduationCap,
    progress: faChartLine,
    logout: faRightFromBracket,
  };

  constructor(public auth: AuthService) {}

  logout(): void {
    this.auth.logout();
  }
}
