using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260718090200_ImproveProgressSlotLifecycle")]
public sealed class ImproveProgressSlotLifecycle : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF COL_LENGTH(N'dbo.StudentProgress', N'IsActive') IS NULL
            BEGIN
                ALTER TABLE [dbo].[StudentProgress]
                    ADD [IsActive] bit NOT NULL
                        CONSTRAINT [DF_StudentProgress_IsActive] DEFAULT CAST(1 AS bit);
            END;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF COL_LENGTH(N'dbo.StudentProgress', N'IsActive') IS NOT NULL
            BEGIN
                ALTER TABLE [dbo].[StudentProgress]
                    DROP CONSTRAINT IF EXISTS [DF_StudentProgress_IsActive];
                ALTER TABLE [dbo].[StudentProgress]
                    DROP COLUMN [IsActive];
            END;
            """);
    }
}
