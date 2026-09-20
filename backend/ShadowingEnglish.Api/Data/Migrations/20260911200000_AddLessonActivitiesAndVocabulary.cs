using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260911200000_AddLessonActivitiesAndVocabulary")]
public sealed class AddLessonActivitiesAndVocabulary : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF COL_LENGTH(N'[dbo].[Lessons]', N'VocabularyJson') IS NULL
                ALTER TABLE [dbo].[Lessons]
                ADD [VocabularyJson] nvarchar(max) NOT NULL
                    CONSTRAINT [DF_Lessons_VocabularyJson] DEFAULT N'[]';

            IF COL_LENGTH(N'[dbo].[Lessons]', N'ActivitiesJson') IS NULL
                ALTER TABLE [dbo].[Lessons]
                ADD [ActivitiesJson] nvarchar(max) NOT NULL
                    CONSTRAINT [DF_Lessons_ActivitiesJson] DEFAULT N'[]';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF COL_LENGTH(N'[dbo].[Lessons]', N'ActivitiesJson') IS NOT NULL
            BEGIN
                IF OBJECT_ID(N'[dbo].[DF_Lessons_ActivitiesJson]', N'D') IS NOT NULL
                    ALTER TABLE [dbo].[Lessons] DROP CONSTRAINT [DF_Lessons_ActivitiesJson];
                ALTER TABLE [dbo].[Lessons] DROP COLUMN [ActivitiesJson];
            END;
            IF COL_LENGTH(N'[dbo].[Lessons]', N'VocabularyJson') IS NOT NULL
            BEGIN
                IF OBJECT_ID(N'[dbo].[DF_Lessons_VocabularyJson]', N'D') IS NOT NULL
                    ALTER TABLE [dbo].[Lessons] DROP CONSTRAINT [DF_Lessons_VocabularyJson];
                ALTER TABLE [dbo].[Lessons] DROP COLUMN [VocabularyJson];
            END;
            """);
    }
}
