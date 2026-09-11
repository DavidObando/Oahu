package Oahu.BooksDatabase.Migrations

import Microsoft.EntityFrameworkCore.Migrations

open partial class ChapterTree : Migration {
    protected open override func Up(migrationBuilder MigrationBuilder) {
        migrationBuilder.DropForeignKey(name: "FK_ChapterInfos_Books_BookId", table: "ChapterInfos")
        migrationBuilder.DropForeignKey(name: "FK_ChapterInfos_Components_ComponentId", table: "ChapterInfos")
        migrationBuilder.DropForeignKey(name: "FK_Conversions_Books_BookId", table: "Conversions")
        migrationBuilder.DropForeignKey(name: "FK_Conversions_Components_ComponentId", table: "Conversions")
        migrationBuilder.AlterColumn[int32](
            name: "ChapterInfoId",
            table: "Chapters",
            type: "INTEGER",
            nullable: true,
            oldClrType: typeof(int32),
            oldType: "INTEGER"
        )
        migrationBuilder.AddColumn[int32](name: "ParentChapterId", table: "Chapters", type: "INTEGER", nullable: true)
        migrationBuilder.CreateIndex(name: "IX_Chapters_ParentChapterId", table: "Chapters", column: "ParentChapterId")
        migrationBuilder.AddForeignKey(
            name: "FK_ChapterInfos_Books_BookId",
            table: "ChapterInfos",
            column: "BookId",
            principalTable: "Books",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade
        )
        migrationBuilder.AddForeignKey(
            name: "FK_ChapterInfos_Components_ComponentId",
            table: "ChapterInfos",
            column: "ComponentId",
            principalTable: "Components",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade
        )
        migrationBuilder.AddForeignKey(
            name: "FK_Chapters_Chapters_ParentChapterId",
            table: "Chapters",
            column: "ParentChapterId",
            principalTable: "Chapters",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade
        )
        migrationBuilder.AddForeignKey(
            name: "FK_Conversions_Books_BookId",
            table: "Conversions",
            column: "BookId",
            principalTable: "Books",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade
        )
        migrationBuilder.AddForeignKey(
            name: "FK_Conversions_Components_ComponentId",
            table: "Conversions",
            column: "ComponentId",
            principalTable: "Components",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade
        )
    }

    protected open override func Down(migrationBuilder MigrationBuilder) {
        migrationBuilder.DropForeignKey(name: "FK_ChapterInfos_Books_BookId", table: "ChapterInfos")
        migrationBuilder.DropForeignKey(name: "FK_ChapterInfos_Components_ComponentId", table: "ChapterInfos")
        migrationBuilder.DropForeignKey(name: "FK_Chapters_Chapters_ParentChapterId", table: "Chapters")
        migrationBuilder.DropForeignKey(name: "FK_Conversions_Books_BookId", table: "Conversions")
        migrationBuilder.DropForeignKey(name: "FK_Conversions_Components_ComponentId", table: "Conversions")
        migrationBuilder.DropIndex(name: "IX_Chapters_ParentChapterId", table: "Chapters")
        migrationBuilder.DropColumn(name: "ParentChapterId", table: "Chapters")
        migrationBuilder.AlterColumn[int32](
            name: "ChapterInfoId",
            table: "Chapters",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0,
            oldClrType: typeof(int32),
            oldType: "INTEGER",
            oldNullable: true
        )
        migrationBuilder.AddForeignKey(
            name: "FK_ChapterInfos_Books_BookId",
            table: "ChapterInfos",
            column: "BookId",
            principalTable: "Books",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict
        )
        migrationBuilder.AddForeignKey(
            name: "FK_ChapterInfos_Components_ComponentId",
            table: "ChapterInfos",
            column: "ComponentId",
            principalTable: "Components",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict
        )
        migrationBuilder.AddForeignKey(
            name: "FK_Conversions_Books_BookId",
            table: "Conversions",
            column: "BookId",
            principalTable: "Books",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict
        )
        migrationBuilder.AddForeignKey(
            name: "FK_Conversions_Components_ComponentId",
            table: "Conversions",
            column: "ComponentId",
            principalTable: "Components",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict
        )
    }
}
