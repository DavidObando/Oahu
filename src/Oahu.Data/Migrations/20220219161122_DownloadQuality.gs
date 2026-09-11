package Oahu.BooksDatabase.Migrations

import Microsoft.EntityFrameworkCore.Migrations

open partial class DownloadQuality : Migration {
    protected open override func Up(migrationBuilder MigrationBuilder) {
        migrationBuilder.AddColumn[int32](name: "DownloadQuality", table: "Components", type: "INTEGER", nullable: true)
        migrationBuilder.AddColumn[int32](name: "DownloadQuality", table: "Books", type: "INTEGER", nullable: true)
    }

    protected open override func Down(migrationBuilder MigrationBuilder) {
        migrationBuilder.DropColumn(name: "DownloadQuality", table: "Components")
        migrationBuilder.DropColumn(name: "DownloadQuality", table: "Books")
    }
}
