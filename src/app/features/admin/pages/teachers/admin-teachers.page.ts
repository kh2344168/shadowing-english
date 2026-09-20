import { Component } from '@angular/core';
import { PageHeader } from '../../../../shared/components/page-header/page-header';

@Component({
  selector: 'app-admin-teachers-page',
  standalone: true,
  imports: [PageHeader],
  templateUrl: './admin-teachers.page.html',
  styleUrl: './admin-teachers.page.scss',
})
export class AdminTeachersPage {}
