import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AuthService } from '../../../../core/auth/services/auth.service';
import {
  faArrowRightArrowLeft,
  faGraduationCap,
  faMagnifyingGlass,
  faPlus,
  faUserGroup,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { StudentAccount } from '../../data-access/student.models';
import { StudentRepository } from '../../data-access/student.repository';
import { TeacherGroup } from '../../data-access/teacher-group.models';
import { TeacherGroupRepository } from '../../data-access/teacher-group.repository';

type GroupPickerMode = 'add' | 'move';

@Component({
  selector: 'app-teacher-students-page',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './teacher-students.page.html',
  styleUrl: './teacher-students.page.scss',
})
export class TeacherStudentsPage implements OnInit {
  readonly icons = {
    student: faGraduationCap,
    group: faUserGroup,
    add: faPlus,
    move: faArrowRightArrowLeft,
    search: faMagnifyingGlass,
    close: faXmark,
  };

  students: StudentAccount[] = [];
  groups: TeacherGroup[] = [];

  addOpen = false;
  name = '';
  email = '';
  selectedGroupId = '';
  message = '';

  groupPickerOpen = false;
  groupPickerMode: GroupPickerMode = 'add';
  groupSearch = '';
  movingStudentId = '';

  constructor(
    private studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.refreshData();
  }

  get filteredGroups(): TeacherGroup[] {
    const query = this.groupSearch.trim().toLowerCase();
    return query
      ? this.groups.filter((group) => group.name.toLowerCase().includes(query))
      : this.groups;
  }

  refreshData(): void {
    const teacherId = this.auth.currentUser?.id || '';
    this.groups = this.groupRepository
      .getGroups()
      .filter((group) => !group.teacherId || group.teacherId === teacherId);
    const groupIds = new Set(this.groups.map((group) => group.id));
    this.students = this.studentRepository
      .getStudents()
      .filter((student) => groupIds.has(student.groupId));

    if (
      this.selectedGroupId &&
      !this.groups.some((group) => group.id === this.selectedGroupId)
    ) {
      this.selectedGroupId = '';
    }
  }

  openGroupPicker(mode: GroupPickerMode, student?: StudentAccount): void {
    this.groupPickerMode = mode;
    this.groupSearch = '';
    this.movingStudentId = student?.id || '';
    this.groupPickerOpen = true;
  }

  selectGroup(group: TeacherGroup): void {
    if (this.groupPickerMode === 'add') {
      this.selectedGroupId = group.id;
      this.groupPickerOpen = false;
      return;
    }

    const student = this.students.find(
      (item) => item.id === this.movingStudentId,
    );
    if (!student || student.groupId === group.id) {
      this.groupPickerOpen = false;
      return;
    }

    const confirmed = window.confirm(
      `نقل ${student.name} إلى ${group.name}؟`,
    );
    if (!confirmed) return;

    this.studentRepository.moveStudent(student.id, group.id);
    this.groupPickerOpen = false;
    this.message = `تم نقل ${student.name} إلى ${group.name}.`;
    this.refreshData();
  }

  addStudent(): void {
    const name = this.name.trim();
    const email = this.email.trim();

    if (!name || !email || !this.selectedGroupId) {
      this.message = 'اكتب اسم الطالب والبريد واختر المجموعة.';
      return;
    }

    const result = this.studentRepository.addStudent(
      name,
      email,
      this.selectedGroupId,
    );

    if (!result) {
      this.message = 'تعذر إنشاء الطالب. غالبًا البريد مستخدم بالفعل.';
      return;
    }

    this.message = `تم إنشاء الطالب. كلمة المرور المؤقتة: ${result.temporaryPassword}`;
    this.name = '';
    this.email = '';
    this.selectedGroupId = '';
    this.addOpen = false;
    this.refreshData();
  }

  groupName(groupId: string): string {
    return this.groups.find((group) => group.id === groupId)?.name || '—';
  }

  selectedGroupName(): string {
    if (!this.selectedGroupId) return 'اختر المجموعة';
    return this.groupName(this.selectedGroupId);
  }
}
