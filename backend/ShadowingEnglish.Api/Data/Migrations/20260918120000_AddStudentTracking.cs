using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260918120000_AddStudentTracking")]
public sealed class AddStudentTracking : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
IF OBJECT_ID(N'[LearningGroups]', N'U') IS NULL
BEGIN
    CREATE TABLE [LearningGroups] (
        [Id] nvarchar(120) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [CefrLevel] nvarchar(16) NOT NULL,
        [SupervisorId] nvarchar(120) NOT NULL,
        [SupervisorName] nvarchar(160) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_LearningGroups] PRIMARY KEY ([Id])
    );
END;

IF OBJECT_ID(N'[StudentAccounts]', N'U') IS NULL
BEGIN
    CREATE TABLE [StudentAccounts] (
        [Id] nvarchar(120) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Email] nvarchar(240) NOT NULL,
        [PasswordHash] nvarchar(1000) NOT NULL,
        [GroupId] nvarchar(120) NOT NULL,
        [GroupName] nvarchar(160) NOT NULL,
        [CefrLevel] nvarchar(16) NOT NULL,
        [AccountStatus] nvarchar(32) NOT NULL,
        [SubscriptionStatus] nvarchar(32) NOT NULL,
        [LastSeenAtUtc] datetime2 NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_StudentAccounts] PRIMARY KEY ([Id])
    );
END;

IF OBJECT_ID(N'[StudentActivityEvents]', N'U') IS NULL
BEGIN
    CREATE TABLE [StudentActivityEvents] (
        [Id] uniqueidentifier NOT NULL,
        [CorrelationId] nvarchar(120) NOT NULL,
        [StudentId] nvarchar(120) NOT NULL,
        [GroupId] nvarchar(120) NOT NULL,
        [LessonId] nvarchar(160) NOT NULL,
        [LessonTitle] nvarchar(240) NOT NULL,
        [CurriculumSlotId] nvarchar(160) NOT NULL,
        [StageId] nvarchar(120) NOT NULL,
        [EventType] nvarchar(80) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [DetailsJson] nvarchar(max) NOT NULL,
        [DurationMs] bigint NULL,
        [OccurredAtUtc] datetime2 NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_StudentActivityEvents] PRIMARY KEY ([Id])
    );
END;

IF OBJECT_ID(N'[StudentRecordings]', N'U') IS NULL
BEGIN
    CREATE TABLE [StudentRecordings] (
        [Id] uniqueidentifier NOT NULL,
        [ClientRecordingId] nvarchar(180) NOT NULL,
        [StudentId] nvarchar(120) NOT NULL,
        [GroupId] nvarchar(120) NOT NULL,
        [LessonId] nvarchar(160) NOT NULL,
        [LessonTitle] nvarchar(240) NOT NULL,
        [CurriculumSlotId] nvarchar(160) NOT NULL,
        [StageId] nvarchar(120) NOT NULL,
        [RecordingType] nvarchar(40) NOT NULL,
        [AttemptNumber] int NOT NULL,
        [DurationMs] bigint NOT NULL,
        [FileName] nvarchar(260) NOT NULL,
        [ContentType] nvarchar(120) NOT NULL,
        [SizeBytes] bigint NOT NULL,
        [AudioData] varbinary(max) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_StudentRecordings] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LearningGroups_Name' AND object_id = OBJECT_ID('LearningGroups'))
    CREATE INDEX [IX_LearningGroups_Name] ON [LearningGroups] ([Name]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentAccounts_Email' AND object_id = OBJECT_ID('StudentAccounts'))
    CREATE UNIQUE INDEX [IX_StudentAccounts_Email] ON [StudentAccounts] ([Email]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentAccounts_GroupId' AND object_id = OBJECT_ID('StudentAccounts'))
    CREATE INDEX [IX_StudentAccounts_GroupId] ON [StudentAccounts] ([GroupId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentAccounts_LastSeenAtUtc' AND object_id = OBJECT_ID('StudentAccounts'))
    CREATE INDEX [IX_StudentAccounts_LastSeenAtUtc] ON [StudentAccounts] ([LastSeenAtUtc]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentActivityEvents_CorrelationId' AND object_id = OBJECT_ID('StudentActivityEvents'))
    CREATE INDEX [IX_StudentActivityEvents_CorrelationId] ON [StudentActivityEvents] ([CorrelationId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentActivityEvents_StudentId_OccurredAtUtc' AND object_id = OBJECT_ID('StudentActivityEvents'))
    CREATE INDEX [IX_StudentActivityEvents_StudentId_OccurredAtUtc] ON [StudentActivityEvents] ([StudentId], [OccurredAtUtc]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentRecordings_ClientRecordingId' AND object_id = OBJECT_ID('StudentRecordings'))
    CREATE UNIQUE INDEX [IX_StudentRecordings_ClientRecordingId] ON [StudentRecordings] ([ClientRecordingId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentRecordings_StudentId_CreatedAtUtc' AND object_id = OBJECT_ID('StudentRecordings'))
    CREATE INDEX [IX_StudentRecordings_StudentId_CreatedAtUtc] ON [StudentRecordings] ([StudentId], [CreatedAtUtc]);
""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "StudentRecordings");
        migrationBuilder.DropTable(name: "StudentActivityEvents");
        migrationBuilder.DropTable(name: "StudentAccounts");
        migrationBuilder.DropTable(name: "LearningGroups");
    }
}
