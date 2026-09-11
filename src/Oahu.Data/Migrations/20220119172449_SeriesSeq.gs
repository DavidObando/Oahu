package Oahu.BooksDatabase.Migrations

import Microsoft.EntityFrameworkCore.Migrations

open partial class SeriesSeq : Migration {
    protected open override func Up(migrationBuilder MigrationBuilder) {
        migrationBuilder.AddColumn[string](name: "Sequence", table: "SeriesBooks", type: "TEXT", nullable: true)
        migrationBuilder.AddColumn[int32](name: "Sort", table: "SeriesBooks", type: "INTEGER", nullable: true)
    }

    protected open override func Down(migrationBuilder MigrationBuilder) {
        migrationBuilder.DropColumn(name: "Sequence", table: "SeriesBooks")
        migrationBuilder.DropColumn(name: "Sort", table: "SeriesBooks")
    }
}
