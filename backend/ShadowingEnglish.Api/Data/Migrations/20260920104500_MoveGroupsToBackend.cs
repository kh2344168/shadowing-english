using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260920104500_MoveGroupsToBackend")]
public sealed class MoveGroupsToBackend : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
IF COL_LENGTH('LearningGroups', 'CurriculumId') IS NULL
    ALTER TABLE [LearningGroups] ADD [CurriculumId] nvarchar(160) NOT NULL CONSTRAINT [DF_LearningGroups_CurriculumId] DEFAULT N'';
IF COL_LENGTH('LearningGroups', 'CurriculumName') IS NULL
    ALTER TABLE [LearningGroups] ADD [CurriculumName] nvarchar(240) NOT NULL CONSTRAINT [DF_LearningGroups_CurriculumName] DEFAULT N'';
IF COL_LENGTH('LearningGroups', 'StartDate') IS NULL
    ALTER TABLE [LearningGroups] ADD [StartDate] nvarchar(32) NOT NULL CONSTRAINT [DF_LearningGroups_StartDate] DEFAULT N'';
IF COL_LENGTH('LearningGroups', 'DraftCurriculumJson') IS NULL
    ALTER TABLE [LearningGroups] ADD [DraftCurriculumJson] nvarchar(max) NOT NULL CONSTRAINT [DF_LearningGroups_DraftCurriculumJson] DEFAULT N'';
IF COL_LENGTH('LearningGroups', 'HasDraftChanges') IS NULL
    ALTER TABLE [LearningGroups] ADD [HasDraftChanges] bit NOT NULL CONSTRAINT [DF_LearningGroups_HasDraftChanges] DEFAULT CAST(0 AS bit);
""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "HasDraftChanges", table: "LearningGroups");
        migrationBuilder.DropColumn(name: "DraftCurriculumJson", table: "LearningGroups");
        migrationBuilder.DropColumn(name: "StartDate", table: "LearningGroups");
        migrationBuilder.DropColumn(name: "CurriculumName", table: "LearningGroups");
        migrationBuilder.DropColumn(name: "CurriculumId", table: "LearningGroups");
    }
}
