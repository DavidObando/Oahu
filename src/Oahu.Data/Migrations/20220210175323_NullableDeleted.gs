package Oahu.BooksDatabase.Migrations

import Microsoft.EntityFrameworkCore.Migrations

open partial class NullableDeleted : Migration {
    protected open override func Up(migrationBuilder MigrationBuilder) {
        migrationBuilder.DropColumn(name: "Removed", table: "Books")
        migrationBuilder.AddColumn[bool](name: "Deleted", table: "Books", type: "INTEGER", nullable: true)
    }

    protected open override func Down(migrationBuilder MigrationBuilder) {
        migrationBuilder.DropColumn(name: "Deleted", table: "Books")
        migrationBuilder.AddColumn[bool](
            name: "Removed",
            table: "Books",
            type: "INTEGER",
            nullable: false,
            defaultValue: false
        )
    }
}
