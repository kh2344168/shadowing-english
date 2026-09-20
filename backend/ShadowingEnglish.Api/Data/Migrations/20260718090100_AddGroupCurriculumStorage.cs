using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260718090100_AddGroupCurriculumStorage")]
public sealed class AddGroupCurriculumStorage : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF OBJECT_ID(N'[dbo].[GroupCurriculumPublications]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[GroupCurriculumPublications] (
                    [GroupId] nvarchar(120) NOT NULL,
                    [GroupName] nvarchar(160) NOT NULL,
                    [SourceCurriculumId] nvarchar(160) NOT NULL,
                    [SourceCurriculumName] nvarchar(240) NOT NULL,
                    [Version] int NOT NULL,
                    [PublishedSnapshotJson] nvarchar(max) NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    [PublishedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_GroupCurriculumPublications] PRIMARY KEY ([GroupId])
                );
            END;

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE [name] = N'IX_GroupCurriculumPublications_UpdatedAtUtc'
                  AND [object_id] = OBJECT_ID(N'[dbo].[GroupCurriculumPublications]'))
                CREATE INDEX [IX_GroupCurriculumPublications_UpdatedAtUtc]
                    ON [dbo].[GroupCurriculumPublications] ([UpdatedAtUtc]);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF OBJECT_ID(N'[dbo].[GroupCurriculumPublications]', N'U') IS NOT NULL
                DROP TABLE [dbo].[GroupCurriculumPublications];
            """);
    }
}
