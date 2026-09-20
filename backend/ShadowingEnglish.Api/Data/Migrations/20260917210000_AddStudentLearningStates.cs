using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260917210000_AddStudentLearningStates")]
public sealed class AddStudentLearningStates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
IF COL_LENGTH('StudentProgress', 'RecordingCount') IS NULL
BEGIN
    ALTER TABLE [StudentProgress] ADD [RecordingCount] int NOT NULL CONSTRAINT [DF_StudentProgress_RecordingCount] DEFAULT 0;
END;

IF OBJECT_ID(N'[StudentLearningStates]', N'U') IS NULL
BEGIN
    CREATE TABLE [StudentLearningStates] (
        [Id] uniqueidentifier NOT NULL,
        [StudentId] nvarchar(120) NOT NULL,
        [StudentName] nvarchar(160) NOT NULL,
        [GroupId] nvarchar(120) NOT NULL,
        [GroupName] nvarchar(160) NOT NULL,
        [StateJson] nvarchar(max) NOT NULL,
        [Revision] int NOT NULL CONSTRAINT [DF_StudentLearningStates_Revision] DEFAULT 0,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_StudentLearningStates] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentLearningStates_StudentId_GroupId' AND object_id = OBJECT_ID('StudentLearningStates'))
BEGIN
    CREATE UNIQUE INDEX [IX_StudentLearningStates_StudentId_GroupId] ON [StudentLearningStates] ([StudentId], [GroupId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StudentLearningStates_UpdatedAtUtc' AND object_id = OBJECT_ID('StudentLearningStates'))
BEGIN
    CREATE INDEX [IX_StudentLearningStates_UpdatedAtUtc] ON [StudentLearningStates] ([UpdatedAtUtc]);
END;
""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "StudentLearningStates");
        migrationBuilder.DropColumn(name: "RecordingCount", table: "StudentProgress");
    }
}
