using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260718090000_AddLessonStorage")]
public sealed class AddLessonStorage : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF OBJECT_ID(N'[dbo].[Lessons]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[Lessons] (
                    [Id] nvarchar(160) NOT NULL,
                    [Title] nvarchar(240) NOT NULL,
                    [Description] nvarchar(2000) NOT NULL,
                    [Status] nvarchar(32) NOT NULL,
                    [RequiredRepetitions] int NOT NULL,
                    [MediaFileName] nvarchar(260) NOT NULL,
                    [MediaType] nvarchar(120) NOT NULL,
                    [MediaData] varbinary(max) NULL,
                    [ScriptLinesJson] nvarchar(max) NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_Lessons] PRIMARY KEY ([Id])
                );
            END;

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE [name] = N'IX_Lessons_Status'
                  AND [object_id] = OBJECT_ID(N'[dbo].[Lessons]'))
                CREATE INDEX [IX_Lessons_Status] ON [dbo].[Lessons] ([Status]);

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE [name] = N'IX_Lessons_UpdatedAtUtc'
                  AND [object_id] = OBJECT_ID(N'[dbo].[Lessons]'))
                CREATE INDEX [IX_Lessons_UpdatedAtUtc] ON [dbo].[Lessons] ([UpdatedAtUtc]);

            IF OBJECT_ID(N'[dbo].[LessonSegments]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[LessonSegments] (
                    [Id] uniqueidentifier NOT NULL,
                    [LessonId] nvarchar(160) NOT NULL,
                    [SortOrder] int NOT NULL,
                    [StartSeconds] float NOT NULL,
                    [EndSeconds] float NOT NULL,
                    [EnglishText] nvarchar(2000) NOT NULL,
                    [ArabicTranslation] nvarchar(2000) NOT NULL,
                    CONSTRAINT [PK_LessonSegments] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_LessonSegments_Lessons_LessonId]
                        FOREIGN KEY ([LessonId]) REFERENCES [dbo].[Lessons] ([Id]) ON DELETE CASCADE
                );
            END;

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE [name] = N'IX_LessonSegments_LessonId_SortOrder'
                  AND [object_id] = OBJECT_ID(N'[dbo].[LessonSegments]'))
                CREATE UNIQUE INDEX [IX_LessonSegments_LessonId_SortOrder]
                    ON [dbo].[LessonSegments] ([LessonId], [SortOrder]);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF OBJECT_ID(N'[dbo].[LessonSegments]', N'U') IS NOT NULL
                DROP TABLE [dbo].[LessonSegments];
            IF OBJECT_ID(N'[dbo].[Lessons]', N'U') IS NOT NULL
                DROP TABLE [dbo].[Lessons];
            """);
    }
}
