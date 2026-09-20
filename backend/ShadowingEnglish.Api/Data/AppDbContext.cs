using Microsoft.EntityFrameworkCore;
using ShadowingEnglish.Api.Models;

namespace ShadowingEnglish.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<StudentProgressRecord> StudentProgress => Set<StudentProgressRecord>();
    public DbSet<StudentLearningStateRecord> StudentLearningStates => Set<StudentLearningStateRecord>();
    public DbSet<LessonRecord> Lessons => Set<LessonRecord>();
    public DbSet<LessonSegmentRecord> LessonSegments => Set<LessonSegmentRecord>();
    public DbSet<GroupCurriculumPublicationRecord> GroupCurriculumPublications => Set<GroupCurriculumPublicationRecord>();
    public DbSet<CurriculumRecord> Curriculums => Set<CurriculumRecord>();
    public DbSet<LearningGroupRecord> LearningGroups => Set<LearningGroupRecord>();
    public DbSet<StudentAccountRecord> StudentAccounts => Set<StudentAccountRecord>();
    public DbSet<StudentActivityEventRecord> StudentActivityEvents => Set<StudentActivityEventRecord>();
    public DbSet<StudentRecordingRecord> StudentRecordings => Set<StudentRecordingRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var progress = modelBuilder.Entity<StudentProgressRecord>();

        progress.ToTable("StudentProgress");
        progress.HasKey(item => item.Id);

        progress.Property(item => item.StudentId).HasMaxLength(120).IsRequired();
        progress.Property(item => item.StudentName).HasMaxLength(160).IsRequired();
        progress.Property(item => item.GroupId).HasMaxLength(120).IsRequired();
        progress.Property(item => item.GroupName).HasMaxLength(160).IsRequired();
        progress.Property(item => item.CurriculumSlotId).HasMaxLength(160).IsRequired();
        progress.Property(item => item.LessonId).HasMaxLength(160).IsRequired();
        progress.Property(item => item.LessonTitle).HasMaxLength(240).IsRequired();
        progress.Property(item => item.IsActive).HasDefaultValue(true);
        progress.Property(item => item.RecordingCount).HasDefaultValue(0);

        progress
            .HasIndex(item => new
            {
                item.StudentId,
                item.GroupId,
                item.CurriculumSlotId,
            })
            .IsUnique();

        progress.HasIndex(item => item.GroupId);
        progress.HasIndex(item => item.StudentId);

        var learningState = modelBuilder.Entity<StudentLearningStateRecord>();

        learningState.ToTable("StudentLearningStates");
        learningState.HasKey(item => item.Id);
        learningState.Property(item => item.StudentId).HasMaxLength(120).IsRequired();
        learningState.Property(item => item.StudentName).HasMaxLength(160).IsRequired();
        learningState.Property(item => item.GroupId).HasMaxLength(120).IsRequired();
        learningState.Property(item => item.GroupName).HasMaxLength(160).IsRequired();
        learningState.Property(item => item.StateJson).HasColumnType("nvarchar(max)").IsRequired();
        learningState.Property(item => item.Revision).HasDefaultValue(0);
        learningState
            .HasIndex(item => new { item.StudentId, item.GroupId })
            .IsUnique();
        learningState.HasIndex(item => item.UpdatedAtUtc);

        var lesson = modelBuilder.Entity<LessonRecord>();

        lesson.ToTable("Lessons");
        lesson.HasKey(item => item.Id);
        lesson.Property(item => item.Id).HasMaxLength(160).ValueGeneratedNever();
        lesson.Property(item => item.Title).HasMaxLength(240).IsRequired();
        lesson.Property(item => item.Description).HasMaxLength(2000).IsRequired();
        lesson.Property(item => item.Status).HasMaxLength(32).IsRequired();
        lesson.Property(item => item.MediaFileName).HasMaxLength(260).IsRequired();
        lesson.Property(item => item.MediaType).HasMaxLength(120).IsRequired();
        lesson.Property(item => item.MediaData).HasColumnType("varbinary(max)");
        lesson.Property(item => item.ScriptLinesJson).HasColumnType("nvarchar(max)").IsRequired();
        lesson.Property(item => item.ContentProfileJson).HasColumnType("nvarchar(max)").IsRequired();
        lesson.Property(item => item.VocabularyJson).HasColumnType("nvarchar(max)").IsRequired();
        lesson.Property(item => item.ActivitiesJson).HasColumnType("nvarchar(max)").IsRequired();
        lesson.HasIndex(item => item.Status);
        lesson.HasIndex(item => item.UpdatedAtUtc);

        lesson
            .HasMany(item => item.Segments)
            .WithOne(item => item.Lesson)
            .HasForeignKey(item => item.LessonId)
            .OnDelete(DeleteBehavior.Cascade);

        var segment = modelBuilder.Entity<LessonSegmentRecord>();

        segment.ToTable("LessonSegments");
        segment.HasKey(item => item.Id);
        segment.Property(item => item.LessonId).HasMaxLength(160).IsRequired();
        segment.Property(item => item.EnglishText).HasMaxLength(2000).IsRequired();
        segment.Property(item => item.ArabicTranslation).HasMaxLength(2000).IsRequired();
        segment
            .HasIndex(item => new { item.LessonId, item.SortOrder })
            .IsUnique();


        var curriculum = modelBuilder.Entity<CurriculumRecord>();
        curriculum.ToTable("Curriculums");
        curriculum.HasKey(item => item.Id);
        curriculum.Property(item => item.Id).HasMaxLength(160).ValueGeneratedNever();
        curriculum.Property(item => item.Name).HasMaxLength(240).IsRequired();
        curriculum.Property(item => item.Description).HasMaxLength(4000).IsRequired();
        curriculum.Property(item => item.Status).HasMaxLength(32).IsRequired();
        curriculum.Property(item => item.WeeksJson).HasColumnType("nvarchar(max)").IsRequired();
        curriculum.HasIndex(item => item.Status);
        curriculum.HasIndex(item => item.UpdatedAtUtc);

        var learningGroup = modelBuilder.Entity<LearningGroupRecord>();
        learningGroup.ToTable("LearningGroups");
        learningGroup.HasKey(item => item.Id);
        learningGroup.Property(item => item.Id).HasMaxLength(120).ValueGeneratedNever();
        learningGroup.Property(item => item.Name).HasMaxLength(160).IsRequired();
        learningGroup.Property(item => item.CefrLevel).HasMaxLength(16).IsRequired();
        learningGroup.Property(item => item.SupervisorId).HasMaxLength(120).IsRequired();
        learningGroup.Property(item => item.SupervisorName).HasMaxLength(160).IsRequired();
        learningGroup.Property(item => item.CurriculumId).HasMaxLength(160).IsRequired();
        learningGroup.Property(item => item.CurriculumName).HasMaxLength(240).IsRequired();
        learningGroup.Property(item => item.StartDate).HasMaxLength(32).IsRequired();
        learningGroup.Property(item => item.DraftCurriculumJson).HasColumnType("nvarchar(max)").IsRequired();
        learningGroup.HasIndex(item => item.Name);

        var studentAccount = modelBuilder.Entity<StudentAccountRecord>();
        studentAccount.ToTable("StudentAccounts");
        studentAccount.HasKey(item => item.Id);
        studentAccount.Property(item => item.Id).HasMaxLength(120).ValueGeneratedNever();
        studentAccount.Property(item => item.Name).HasMaxLength(160).IsRequired();
        studentAccount.Property(item => item.Email).HasMaxLength(240).IsRequired();
        studentAccount.Property(item => item.PasswordHash).HasMaxLength(1000).IsRequired();
        studentAccount.Property(item => item.GroupId).HasMaxLength(120).IsRequired();
        studentAccount.Property(item => item.GroupName).HasMaxLength(160).IsRequired();
        studentAccount.Property(item => item.CefrLevel).HasMaxLength(16).IsRequired();
        studentAccount.Property(item => item.AccountStatus).HasMaxLength(32).IsRequired();
        studentAccount.Property(item => item.SubscriptionStatus).HasMaxLength(32).IsRequired();
        studentAccount.HasIndex(item => item.Email).IsUnique();
        studentAccount.HasIndex(item => item.GroupId);
        studentAccount.HasIndex(item => item.LastSeenAtUtc);

        var activityEvent = modelBuilder.Entity<StudentActivityEventRecord>();
        activityEvent.ToTable("StudentActivityEvents");
        activityEvent.HasKey(item => item.Id);
        activityEvent.Property(item => item.CorrelationId).HasMaxLength(120).IsRequired();
        activityEvent.Property(item => item.StudentId).HasMaxLength(120).IsRequired();
        activityEvent.Property(item => item.GroupId).HasMaxLength(120).IsRequired();
        activityEvent.Property(item => item.LessonId).HasMaxLength(160).IsRequired();
        activityEvent.Property(item => item.LessonTitle).HasMaxLength(240).IsRequired();
        activityEvent.Property(item => item.CurriculumSlotId).HasMaxLength(160).IsRequired();
        activityEvent.Property(item => item.StageId).HasMaxLength(120).IsRequired();
        activityEvent.Property(item => item.EventType).HasMaxLength(80).IsRequired();
        activityEvent.Property(item => item.Status).HasMaxLength(32).IsRequired();
        activityEvent.Property(item => item.DetailsJson).HasColumnType("nvarchar(max)").IsRequired();
        activityEvent.HasIndex(item => new { item.StudentId, item.OccurredAtUtc });
        activityEvent.HasIndex(item => item.CorrelationId);

        var recording = modelBuilder.Entity<StudentRecordingRecord>();
        recording.ToTable("StudentRecordings");
        recording.HasKey(item => item.Id);
        recording.Property(item => item.ClientRecordingId).HasMaxLength(180).IsRequired();
        recording.Property(item => item.StudentId).HasMaxLength(120).IsRequired();
        recording.Property(item => item.GroupId).HasMaxLength(120).IsRequired();
        recording.Property(item => item.LessonId).HasMaxLength(160).IsRequired();
        recording.Property(item => item.LessonTitle).HasMaxLength(240).IsRequired();
        recording.Property(item => item.CurriculumSlotId).HasMaxLength(160).IsRequired();
        recording.Property(item => item.StageId).HasMaxLength(120).IsRequired();
        recording.Property(item => item.RecordingType).HasMaxLength(40).IsRequired();
        recording.Property(item => item.FileName).HasMaxLength(260).IsRequired();
        recording.Property(item => item.ContentType).HasMaxLength(120).IsRequired();
        recording.Property(item => item.AudioData).HasColumnType("varbinary(max)").IsRequired();
        recording.HasIndex(item => new { item.StudentId, item.CreatedAtUtc });
        recording.HasIndex(item => item.ClientRecordingId).IsUnique();

        var groupCurriculum = modelBuilder.Entity<GroupCurriculumPublicationRecord>();

        groupCurriculum.ToTable("GroupCurriculumPublications");
        groupCurriculum.HasKey(item => item.GroupId);
        groupCurriculum.Property(item => item.GroupId).HasMaxLength(120).ValueGeneratedNever();
        groupCurriculum.Property(item => item.GroupName).HasMaxLength(160).IsRequired();
        groupCurriculum.Property(item => item.SourceCurriculumId).HasMaxLength(160).IsRequired();
        groupCurriculum.Property(item => item.SourceCurriculumName).HasMaxLength(240).IsRequired();
        groupCurriculum.Property(item => item.PublishedSnapshotJson).HasColumnType("nvarchar(max)").IsRequired();
        groupCurriculum.HasIndex(item => item.UpdatedAtUtc);
    }
}
