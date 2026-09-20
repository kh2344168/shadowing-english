import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-settings.page.html',
  styleUrl: './admin-settings.page.scss',
})
export class AdminSettingsPage {
  appName = 'Shadowing English';
  programMonths = 4;
  allowScheduledPublishing = true;
  protectUnpublishedContent = true;
  keepDailyRecordingsLocal = true;
  defaultCefr = 'A1';
  defaultRepetitions = 3;
  helperLanguage = 'ar';
  maxVocabularyItems = 12;
  aiAutoApprove = false;
  teacherVoicePreview = true;
  feedback = '';

  save(): void {
    localStorage.setItem('shadowing-admin-display-settings-v1', JSON.stringify({
      appName: this.appName,
      programMonths: this.programMonths,
      allowScheduledPublishing: this.allowScheduledPublishing,
      protectUnpublishedContent: this.protectUnpublishedContent,
      keepDailyRecordingsLocal: this.keepDailyRecordingsLocal,
      defaultCefr: this.defaultCefr,
      defaultRepetitions: this.defaultRepetitions,
      helperLanguage: this.helperLanguage,
      maxVocabularyItems: this.maxVocabularyItems,
      aiAutoApprove: this.aiAutoApprove,
      teacherVoicePreview: this.teacherVoicePreview,
    }));
    this.feedback = 'تم حفظ إعدادات الواجهة محليًا. الإعدادات الأمنية النهائية تظل مسؤولية الـBackend.';
  }
}
