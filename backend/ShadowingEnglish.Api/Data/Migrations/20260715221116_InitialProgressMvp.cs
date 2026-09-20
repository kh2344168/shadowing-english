using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ShadowingEnglish.Api.Data;

namespace ShadowingEnglish.Api.Data.Migrations;

public partial class InitialProgressMvp : Migration{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF OBJECT_ID(N'[dbo].[StudentProgress]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[StudentProgress] (
                    [Id] uniqueidentifier NOT NULL,
                    [StudentId] nvarchar(120) NOT NULL,
                    [StudentName] nvarchar(160) NOT NULL,
                    [GroupId] nvarchar(120) NOT NULL,
                    [GroupName] nvarchar(160) NOT NULL,
                    [CurriculumSlotId] nvarchar(160) NOT NULL,
                    [LessonId] nvarchar(160) NOT NULL,
                    [LessonTitle] nvarchar(240) NOT NULL,
                    [CompletedRepetitions] int NOT NULL,
                    [RequiredRepetitions] int NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_StudentProgress] PRIMARY KEY ([Id])
                );

                CREATE INDEX [IX_StudentProgress_GroupId]
                    ON [dbo].[StudentProgress] ([GroupId]);
                CREATE INDEX [IX_StudentProgress_StudentId]
                    ON [dbo].[StudentProgress] ([StudentId]);
                CREATE UNIQUE INDEX [IX_StudentProgress_StudentId_GroupId_CurriculumSlotId]
                    ON [dbo].[StudentProgress] ([StudentId], [GroupId], [CurriculumSlotId]);
            END;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            IF OBJECT_ID(N'[dbo].[StudentProgress]', N'U') IS NOT NULL
                DROP TABLE [dbo].[StudentProgress];
            """);
    }
}
