using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260912160000_AddLessonContentProfile")]
public sealed class AddLessonContentProfile : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF COL_LENGTH(N'[dbo].[Lessons]', N'ContentProfileJson') IS NULL
                ALTER TABLE [dbo].[Lessons]
                ADD [ContentProfileJson] nvarchar(max) NOT NULL
                    CONSTRAINT [DF_Lessons_ContentProfileJson] DEFAULT N'{}';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF COL_LENGTH(N'[dbo].[Lessons]', N'ContentProfileJson') IS NOT NULL
            BEGIN
                IF OBJECT_ID(N'[dbo].[DF_Lessons_ContentProfileJson]', N'D') IS NOT NULL
                    ALTER TABLE [dbo].[Lessons] DROP CONSTRAINT [DF_Lessons_ContentProfileJson];
                ALTER TABLE [dbo].[Lessons] DROP COLUMN [ContentProfileJson];
            END;
            """);
    }
}
