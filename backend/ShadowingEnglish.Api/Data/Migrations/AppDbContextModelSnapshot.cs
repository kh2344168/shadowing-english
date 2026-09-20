using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
public sealed class AppDbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
#pragma warning disable 612, 618
        modelBuilder
            .HasAnnotation("ProductVersion", "10.0.10")
            .HasAnnotation("Relational:MaxIdentifierLength", 128);

        SqlServerModelBuilderExtensions.UseIdentityColumns(modelBuilder);

        modelBuilder.Entity("ShadowingEnglish.Api.Models.CurriculumRecord", entity =>
        {
            entity.Property<string>("Id")
                .ValueGeneratedNever()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<DateTime>("CreatedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("Description")
                .IsRequired()
                .HasMaxLength(4000)
                .HasColumnType("nvarchar(4000)");

            entity.Property<string>("Name")
                .IsRequired()
                .HasMaxLength(240)
                .HasColumnType("nvarchar(240)");

            entity.Property<string>("Status")
                .IsRequired()
                .HasMaxLength(32)
                .HasColumnType("nvarchar(32)");

            entity.Property<DateTime>("UpdatedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("WeeksJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.HasKey("Id");
            entity.HasIndex("Status");
            entity.HasIndex("UpdatedAtUtc");
            entity.ToTable("Curriculums");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.GroupCurriculumPublicationRecord", entity =>
        {
            entity.Property<string>("GroupId")
                .ValueGeneratedNever()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("GroupName")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<DateTime>("PublishedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("PublishedSnapshotJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.Property<string>("SourceCurriculumId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("SourceCurriculumName")
                .IsRequired()
                .HasMaxLength(240)
                .HasColumnType("nvarchar(240)");

            entity.Property<DateTime>("UpdatedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<int>("Version")
                .HasColumnType("int");

            entity.HasKey("GroupId");
            entity.HasIndex("UpdatedAtUtc");
            entity.ToTable("GroupCurriculumPublications");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.LearningGroupRecord", entity =>
        {
            entity.Property<string>("Id")
                .ValueGeneratedNever()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("CefrLevel")
                .IsRequired()
                .HasMaxLength(16)
                .HasColumnType("nvarchar(16)");

            entity.Property<string>("CurriculumId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("CurriculumName")
                .IsRequired()
                .HasMaxLength(240)
                .HasColumnType("nvarchar(240)");

            entity.Property<string>("DraftCurriculumJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.Property<bool>("HasDraftChanges")
                .HasColumnType("bit");

            entity.Property<DateTime>("CreatedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<bool>("IsActive")
                .HasColumnType("bit");

            entity.Property<string>("Name")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("StartDate")
                .IsRequired()
                .HasMaxLength(32)
                .HasColumnType("nvarchar(32)");

            entity.Property<string>("SupervisorId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("SupervisorName")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<DateTime>("UpdatedAtUtc")
                .HasColumnType("datetime2");

            entity.HasKey("Id");
            entity.HasIndex("Name");
            entity.ToTable("LearningGroups");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.StudentAccountRecord", entity =>
        {
            entity.Property<string>("Id")
                .ValueGeneratedNever()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("AccountStatus")
                .IsRequired()
                .HasMaxLength(32)
                .HasColumnType("nvarchar(32)");

            entity.Property<string>("CefrLevel")
                .IsRequired()
                .HasMaxLength(16)
                .HasColumnType("nvarchar(16)");

            entity.Property<DateTime>("CreatedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("Email")
                .IsRequired()
                .HasMaxLength(240)
                .HasColumnType("nvarchar(240)");

            entity.Property<string>("GroupId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("GroupName")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<DateTime?>("LastSeenAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("Name")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("PasswordHash")
                .IsRequired()
                .HasMaxLength(1000)
                .HasColumnType("nvarchar(1000)");

            entity.Property<string>("SubscriptionStatus")
                .IsRequired()
                .HasMaxLength(32)
                .HasColumnType("nvarchar(32)");

            entity.Property<DateTime>("UpdatedAtUtc")
                .HasColumnType("datetime2");

            entity.HasKey("Id");
            entity.HasIndex("Email").IsUnique();
            entity.HasIndex("GroupId");
            entity.HasIndex("LastSeenAtUtc");
            entity.ToTable("StudentAccounts");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.StudentActivityEventRecord", entity =>
        {
            entity.Property<Guid>("Id")
                .ValueGeneratedOnAdd()
                .HasColumnType("uniqueidentifier");

            entity.Property<string>("CorrelationId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<DateTime>("CreatedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("CurriculumSlotId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("DetailsJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.Property<long?>("DurationMs")
                .HasColumnType("bigint");

            entity.Property<string>("EventType")
                .IsRequired()
                .HasMaxLength(80)
                .HasColumnType("nvarchar(80)");

            entity.Property<string>("GroupId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("LessonId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("LessonTitle")
                .IsRequired()
                .HasMaxLength(240)
                .HasColumnType("nvarchar(240)");

            entity.Property<DateTime>("OccurredAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("StageId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("Status")
                .IsRequired()
                .HasMaxLength(32)
                .HasColumnType("nvarchar(32)");

            entity.Property<string>("StudentId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.HasKey("Id");
            entity.HasIndex("CorrelationId");
            entity.HasIndex("StudentId", "OccurredAtUtc");
            entity.ToTable("StudentActivityEvents");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.StudentRecordingRecord", entity =>
        {
            entity.Property<Guid>("Id")
                .ValueGeneratedOnAdd()
                .HasColumnType("uniqueidentifier");

            entity.Property<int>("AttemptNumber")
                .HasColumnType("int");

            entity.Property<byte[]>("AudioData")
                .IsRequired()
                .HasColumnType("varbinary(max)");

            entity.Property<string>("ClientRecordingId")
                .IsRequired()
                .HasMaxLength(180)
                .HasColumnType("nvarchar(180)");

            entity.Property<string>("ContentType")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<DateTime>("CreatedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("CurriculumSlotId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<long>("DurationMs")
                .HasColumnType("bigint");

            entity.Property<string>("FileName")
                .IsRequired()
                .HasMaxLength(260)
                .HasColumnType("nvarchar(260)");

            entity.Property<string>("GroupId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("LessonId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("LessonTitle")
                .IsRequired()
                .HasMaxLength(240)
                .HasColumnType("nvarchar(240)");

            entity.Property<string>("RecordingType")
                .IsRequired()
                .HasMaxLength(40)
                .HasColumnType("nvarchar(40)");

            entity.Property<long>("SizeBytes")
                .HasColumnType("bigint");

            entity.Property<string>("StageId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("StudentId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.HasKey("Id");
            entity.HasIndex("ClientRecordingId").IsUnique();
            entity.HasIndex("StudentId", "CreatedAtUtc");
            entity.ToTable("StudentRecordings");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.LessonRecord", entity =>
        {
            entity.Property<string>("Id")
                .ValueGeneratedNever()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<DateTime>("CreatedAtUtc")
                .HasColumnType("datetime2");

            entity.Property<string>("Description")
                .IsRequired()
                .HasMaxLength(2000)
                .HasColumnType("nvarchar(2000)");

            entity.Property<string>("ActivitiesJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.Property<string>("ContentProfileJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.Property<byte[]>("MediaData")
                .HasColumnType("varbinary(max)");

            entity.Property<string>("MediaFileName")
                .IsRequired()
                .HasMaxLength(260)
                .HasColumnType("nvarchar(260)");

            entity.Property<string>("MediaType")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<int>("RequiredRepetitions")
                .HasColumnType("int");

            entity.Property<string>("ScriptLinesJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.Property<string>("VocabularyJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.Property<string>("Status")
                .IsRequired()
                .HasMaxLength(32)
                .HasColumnType("nvarchar(32)");

            entity.Property<string>("Title")
                .IsRequired()
                .HasMaxLength(240)
                .HasColumnType("nvarchar(240)");

            entity.Property<DateTime>("UpdatedAtUtc")
                .HasColumnType("datetime2");

            entity.HasKey("Id");
            entity.HasIndex("Status");
            entity.HasIndex("UpdatedAtUtc");
            entity.ToTable("Lessons");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.LessonSegmentRecord", entity =>
        {
            entity.Property<Guid>("Id")
                .ValueGeneratedOnAdd()
                .HasColumnType("uniqueidentifier");

            entity.Property<string>("ArabicTranslation")
                .IsRequired()
                .HasMaxLength(2000)
                .HasColumnType("nvarchar(2000)");

            entity.Property<double>("EndSeconds")
                .HasColumnType("float");

            entity.Property<string>("EnglishText")
                .IsRequired()
                .HasMaxLength(2000)
                .HasColumnType("nvarchar(2000)");

            entity.Property<string>("LessonId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<int>("SortOrder")
                .HasColumnType("int");

            entity.Property<double>("StartSeconds")
                .HasColumnType("float");

            entity.HasKey("Id");
            entity.HasIndex("LessonId", "SortOrder").IsUnique();
            entity.ToTable("LessonSegments");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.StudentLearningStateRecord", entity =>
        {
            entity.Property<Guid>("Id")
                .ValueGeneratedOnAdd()
                .HasColumnType("uniqueidentifier");

            entity.Property<string>("GroupId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("GroupName")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<int>("Revision")
                .ValueGeneratedOnAdd()
                .HasColumnType("int")
                .HasDefaultValue(0);

            entity.Property<string>("StateJson")
                .IsRequired()
                .HasColumnType("nvarchar(max)");

            entity.Property<string>("StudentId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("StudentName")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<DateTime>("UpdatedAtUtc")
                .HasColumnType("datetime2");

            entity.HasKey("Id");
            entity.HasIndex("UpdatedAtUtc");
            entity.HasIndex("StudentId", "GroupId").IsUnique();
            entity.ToTable("StudentLearningStates");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.StudentProgressRecord", entity =>
        {
            entity.Property<Guid>("Id")
                .ValueGeneratedOnAdd()
                .HasColumnType("uniqueidentifier");

            entity.Property<int>("CompletedRepetitions")
                .HasColumnType("int");

            entity.Property<string>("CurriculumSlotId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("GroupId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("GroupName")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<bool>("IsActive")
                .ValueGeneratedOnAdd()
                .HasColumnType("bit")
                .HasDefaultValue(true);

            entity.Property<string>("LessonId")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<string>("LessonTitle")
                .IsRequired()
                .HasMaxLength(240)
                .HasColumnType("nvarchar(240)");

            entity.Property<int>("RecordingCount")
                .ValueGeneratedOnAdd()
                .HasColumnType("int")
                .HasDefaultValue(0);

            entity.Property<int>("RequiredRepetitions")
                .HasColumnType("int");

            entity.Property<string>("StudentId")
                .IsRequired()
                .HasMaxLength(120)
                .HasColumnType("nvarchar(120)");

            entity.Property<string>("StudentName")
                .IsRequired()
                .HasMaxLength(160)
                .HasColumnType("nvarchar(160)");

            entity.Property<DateTime>("UpdatedAtUtc")
                .HasColumnType("datetime2");

            entity.HasKey("Id");
            entity.HasIndex("GroupId");
            entity.HasIndex("StudentId");
            entity.HasIndex("StudentId", "GroupId", "CurriculumSlotId").IsUnique();
            entity.ToTable("StudentProgress");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.LessonSegmentRecord", entity =>
        {
            entity.HasOne("ShadowingEnglish.Api.Models.LessonRecord", "Lesson")
                .WithMany("Segments")
                .HasForeignKey("LessonId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();

            entity.Navigation("Lesson");
        });

        modelBuilder.Entity("ShadowingEnglish.Api.Models.LessonRecord", entity =>
        {
            entity.Navigation("Segments");
        });
#pragma warning restore 612, 618
    }
}
