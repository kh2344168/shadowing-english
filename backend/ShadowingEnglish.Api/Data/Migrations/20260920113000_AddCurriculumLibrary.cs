using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260920113000_AddCurriculumLibrary")]
public sealed class AddCurriculumLibrary : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
IF OBJECT_ID(N'[Curriculums]', N'U') IS NULL
BEGIN
    CREATE TABLE [Curriculums] (
        [Id] nvarchar(160) NOT NULL,
        [Name] nvarchar(240) NOT NULL,
        [Description] nvarchar(4000) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [WeeksJson] nvarchar(max) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_Curriculums] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_Curriculums_Status] ON [Curriculums] ([Status]);
    CREATE INDEX [IX_Curriculums_UpdatedAtUtc] ON [Curriculums] ([UpdatedAtUtc]);
END;
""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "Curriculums");
    }
}
