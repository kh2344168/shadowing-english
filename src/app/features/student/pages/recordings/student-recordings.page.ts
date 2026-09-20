import { Component } from '@angular/core';
import { PageHeader } from '../../../../shared/components/page-header/page-header';

@Component({
  selector: 'app-student-recordings-page',
  standalone: true,
  imports: [PageHeader],
  templateUrl: './student-recordings.page.html',
  styleUrl: './student-recordings.page.scss',
})
export class StudentRecordingsPage {}
