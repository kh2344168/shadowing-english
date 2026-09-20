import { Injectable } from '@angular/core';
import { StudentRepository } from '../../teacher/data-access/student.repository';
import { TeacherGroupRepository } from '../../teacher/data-access/teacher-group.repository';
import {
  AccountStatus,
  PlatformPreviewStore,
  StudentMessagePreview,
  SubscriptionPreview,
  SummaryStatus,
  SupervisorPreview,
  WeekPublicationPreview,
  WeeklySummaryPreview,
} from './platform-preview.models';

@Injectable({ providedIn: 'root' })
export class PlatformPreviewService {
  private readonly storageKey = 'english-shadowing-frontend-preview-v1';

  constructor(
    private studentRepository: StudentRepository,
    private groupRepository: TeacherGroupRepository,
  ) {}

  getSupervisors(): SupervisorPreview[] {
    return this.getStore().supervisors;
  }

  addSupervisor(name: string, email: string, phone: string): SupervisorPreview | null {
    const store = this.getStore();
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || store.supervisors.some((item) => item.email === normalizedEmail)) {
      return null;
    }

    const supervisor: SupervisorPreview = {
      id: this.createId('supervisor'),
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      status: 'active',
      canViewAllGroups: true,
      groupIds: [],
      createdAt: new Date().toISOString(),
    };

    store.supervisors = [supervisor, ...store.supervisors];
    this.saveStore(store);
    return supervisor;
  }

  toggleSupervisor(supervisorId: string): void {
    const store = this.getStore();
    store.supervisors = store.supervisors.map((item) =>
      item.id === supervisorId
        ? { ...item, status: item.status === 'active' ? 'paused' : 'active' }
        : item,
    );
    this.saveStore(store);
  }

  getSubscriptions(): SubscriptionPreview[] {
    const store = this.getStore();
    return store.subscriptions;
  }

  getSubscription(studentId: string): SubscriptionPreview | null {
    return this.getSubscriptions().find((item) => item.studentId === studentId) || null;
  }

  getStudentAccess(studentId: string): { allowed: boolean; status: AccountStatus; message: string } {
    const subscription = this.getSubscription(studentId);
    if (!subscription) {
      return { allowed: false, status: 'expired', message: 'لا يوجد اشتراك فعال لهذا الحساب.' };
    }

    if (subscription.status === 'paused') {
      return { allowed: false, status: 'paused', message: 'تم إيقاف حسابك مؤقتًا. تواصل مع المشرف.' };
    }

    if (subscription.status === 'expired' || new Date(subscription.endDate).getTime() < Date.now()) {
      return { allowed: false, status: 'expired', message: 'لا تستطيع الدخول لانتهاء اشتراكك. يرجى التجديد.' };
    }

    return { allowed: true, status: 'active', message: '' };
  }

  renewSubscription(studentId: string, months = 1): void {
    const store = this.getStore();
    store.subscriptions = store.subscriptions.map((item) => {
      if (item.studentId !== studentId) return item;
      const base = Math.max(new Date(item.endDate).getTime(), Date.now());
      const endDate = new Date(base);
      endDate.setMonth(endDate.getMonth() + months);
      const paidMonths = Math.min(4, item.paidMonths + months);
      return {
        ...item,
        paidMonths,
        currentMonth: Math.min(4, Math.max(item.currentMonth, paidMonths)),
        endDate: endDate.toISOString(),
        status: 'active',
        updatedAt: new Date().toISOString(),
      };
    });
    this.saveStore(store);
  }

  removeStudentData(studentId: string): void {
    const store = this.getStore();
    store.subscriptions = store.subscriptions.filter((item) => item.studentId !== studentId);
    store.weeklySummaries = store.weeklySummaries.filter((item) => item.studentId !== studentId);
    store.messages = store.messages.filter((item) => item.studentId !== studentId);
    this.saveStore(store);
  }

  setSubscriptionStatus(studentId: string, status: AccountStatus): void {
    const store = this.getStore();
    store.subscriptions = store.subscriptions.map((item) =>
      item.studentId === studentId
        ? { ...item, status, updatedAt: new Date().toISOString() }
        : item,
    );
    this.saveStore(store);
  }

  getWeeklySummaries(): WeeklySummaryPreview[] {
    return this.getStore().weeklySummaries;
  }

  reviewSummary(
    summaryId: string,
    status: Exclude<SummaryStatus, 'pending'>,
    rating: number,
    note: string,
    reviewer: string,
  ): void {
    const store = this.getStore();
    store.weeklySummaries = store.weeklySummaries.map((item) =>
      item.id === summaryId
        ? {
            ...item,
            status,
            rating: Math.max(1, Math.min(5, rating)),
            note: note.trim(),
            reviewedBy: reviewer,
            reviewedAt: new Date().toISOString(),
          }
        : item,
    );
    this.saveStore(store);
  }

  submitWeeklySummary(studentId: string, groupId: string, weekNumber: number): WeeklySummaryPreview {
    const store = this.getStore();
    const summary: WeeklySummaryPreview = {
      id: this.createId('summary'),
      studentId,
      groupId,
      weekNumber,
      durationSeconds: 92,
      submittedAt: new Date().toISOString(),
      status: 'pending',
    };
    store.weeklySummaries = [summary, ...store.weeklySummaries];
    this.saveStore(store);
    return summary;
  }

  getMessages(studentId?: string): StudentMessagePreview[] {
    const messages = this.getStore().messages;
    return studentId ? messages.filter((item) => item.studentId === studentId) : messages;
  }

  sendMessage(studentId: string, subject: string, body: string, senderName: string): StudentMessagePreview | null {
    if (!studentId || !subject.trim() || !body.trim()) return null;
    const store = this.getStore();
    const message: StudentMessagePreview = {
      id: this.createId('message'),
      studentId,
      senderName,
      subject: subject.trim(),
      body: body.trim(),
      createdAt: new Date().toISOString(),
      read: false,
    };
    store.messages = [message, ...store.messages];
    this.saveStore(store);
    return message;
  }

  markMessageRead(messageId: string): void {
    const store = this.getStore();
    store.messages = store.messages.map((item) =>
      item.id === messageId ? { ...item, read: true } : item,
    );
    this.saveStore(store);
  }

  getPublications(): WeekPublicationPreview[] {
    return this.getStore().publications;
  }

  publishWeekNow(groupId: string, weekNumber: number): void {
    this.upsertPublication({
      id: this.createId('publication'),
      groupId,
      weekNumber,
      status: 'published',
      publishedAt: new Date().toISOString(),
    });
  }

  scheduleWeek(groupId: string, weekNumber: number, scheduledAt: string): void {
    this.upsertPublication({
      id: this.createId('publication'),
      groupId,
      weekNumber,
      status: 'scheduled',
      scheduledAt: new Date(scheduledAt).toISOString(),
    });
  }

  private upsertPublication(publication: WeekPublicationPreview): void {
    const store = this.getStore();
    const index = store.publications.findIndex(
      (item) => item.groupId === publication.groupId && item.weekNumber === publication.weekNumber,
    );
    if (index === -1) {
      store.publications = [...store.publications, publication];
    } else {
      store.publications = [...store.publications];
      store.publications[index] = { ...publication, id: store.publications[index].id };
    }
    this.saveStore(store);
  }

  private getStore(): PlatformPreviewStore {
    const raw = localStorage.getItem(this.storageKey);
    let store: PlatformPreviewStore | null = null;
    try {
      store = raw ? (JSON.parse(raw) as PlatformPreviewStore) : null;
    } catch {
      store = null;
    }

    const normalized = this.normalizeStore(store || this.createSeedStore());
    this.saveStore(normalized);
    return normalized;
  }

  private normalizeStore(store: PlatformPreviewStore): PlatformPreviewStore {
    const students = this.studentRepository.getStudents();
    const now = new Date().toISOString();
    const subscriptions = [...(store.subscriptions || [])];

    for (const [index, student] of students.entries()) {
      if (subscriptions.some((item) => item.studentId === student.id)) continue;
      const start = new Date();
      start.setMonth(start.getMonth() - Math.min(index, 2));
      const end = new Date();
      end.setMonth(end.getMonth() + (index === 2 ? -1 : 1));
      subscriptions.push({
        studentId: student.id,
        billingMode: index === 1 ? 'full-program' : 'monthly',
        programMonths: 4,
        paidMonths: index === 1 ? 4 : Math.max(1, index + 1),
        currentMonth: Math.max(1, index + 1),
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: index === 2 ? 'expired' : 'active',
        updatedAt: now,
      });
    }

    return {
      supervisors: store.supervisors || [],
      subscriptions,
      weeklySummaries: store.weeklySummaries || [],
      messages: store.messages || [],
      publications: store.publications || [],
    };
  }

  private createSeedStore(): PlatformPreviewStore {
    const students = this.studentRepository.getStudents();
    const groups = this.groupRepository.getGroups();
    const now = new Date();
    const previousDay = new Date(now);
    previousDay.setDate(previousDay.getDate() - 1);

    const subscriptions: SubscriptionPreview[] = students.map((student, index) => {
      const start = new Date(now);
      start.setMonth(start.getMonth() - index);
      const end = new Date(now);
      end.setMonth(end.getMonth() + (index === 2 ? -1 : 1));
      return {
        studentId: student.id,
        billingMode: index === 1 ? 'full-program' : 'monthly',
        programMonths: 4,
        paidMonths: index === 1 ? 4 : index + 1,
        currentMonth: Math.min(4, index + 1),
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: index === 2 ? 'expired' : 'active',
        updatedAt: now.toISOString(),
      };
    });

    const firstStudent = students[0];
    const secondStudent = students[1];
    const firstGroup = groups[0];

    return {
      supervisors: [
        {
          id: 'supervisor-demo',
          name: 'Supervisor Demo',
          email: 'supervisor@demo.com',
          phone: '01000000000',
          status: 'active',
          canViewAllGroups: true,
          groupIds: [],
          createdAt: now.toISOString(),
        },
      ],
      subscriptions,
      weeklySummaries: [
        ...(firstStudent && firstGroup
          ? [
              {
                id: 'summary-demo-1',
                studentId: firstStudent.id,
                groupId: firstGroup.id,
                weekNumber: 2,
                durationSeconds: 88,
                submittedAt: previousDay.toISOString(),
                status: 'pending' as const,
              },
            ]
          : []),
        ...(secondStudent && firstGroup
          ? [
              {
                id: 'summary-demo-2',
                studentId: secondStudent.id,
                groupId: firstGroup.id,
                weekNumber: 1,
                durationSeconds: 73,
                submittedAt: previousDay.toISOString(),
                status: 'accepted' as const,
                rating: 4,
                note: 'نطق جيد، ركّز على سرعة الكلام في المرة القادمة.',
                reviewedBy: 'Supervisor Demo',
                reviewedAt: now.toISOString(),
              },
            ]
          : []),
      ],
      messages: firstStudent
        ? [
            {
              id: 'message-demo-1',
              studentId: firstStudent.id,
              senderName: 'Supervisor Demo',
              subject: 'متابعة الأسبوع الحالي',
              body: 'أداؤك جيد. حاول إنهاء دروس اليوم قبل تسجيل التلخيص الأسبوعي.',
              createdAt: previousDay.toISOString(),
              read: false,
            },
          ]
        : [],
      publications: groups.flatMap((group) => [
        {
          id: `publication-${group.id}-1`,
          groupId: group.id,
          weekNumber: 1,
          status: 'published' as const,
          publishedAt: now.toISOString(),
        },
        {
          id: `publication-${group.id}-2`,
          groupId: group.id,
          weekNumber: 2,
          status: 'scheduled' as const,
          scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]),
    };
  }

  private saveStore(store: PlatformPreviewStore): void {
    localStorage.setItem(this.storageKey, JSON.stringify(store));
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
