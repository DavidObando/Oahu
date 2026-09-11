package Oahu.BooksDatabase.Migrations

import Microsoft.EntityFrameworkCore.Migrations
import Microsoft.EntityFrameworkCore.Migrations.Operations
import Microsoft.EntityFrameworkCore.Migrations.Operations.Builders
import System

open partial class InitialCreate : Migration {
    protected open override func Up(migrationBuilder MigrationBuilder) {
        migrationBuilder.CreateTable(
            name: "Accounts",
            columns: (table ColumnsBuilder) -> AnonymousType3_E3CAE044C2447EA6(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType3_E3CAE044C2447EA6]) -> {
                table.PrimaryKey("PK_Accounts", (x AnonymousType3_E3CAE044C2447EA6) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "Authors",
            columns: (table ColumnsBuilder) -> AnonymousType3_AC86E47FD841D8F5(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType3_AC86E47FD841D8F5]) -> {
                table.PrimaryKey("PK_Authors", (x AnonymousType3_AC86E47FD841D8F5) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "Books",
            columns: (table ColumnsBuilder) -> AnonymousType26_207CBD3FE97773B6(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[float32](type: "REAL", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int64](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[bool](type: "INTEGER", nullable: true),
                table.Column[bool](type: "INTEGER", nullable: true),
                table.Column[DateTime](type: "TEXT", nullable: true),
                table.Column[DateTime](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[bool](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType26_207CBD3FE97773B6]) -> {
                table.PrimaryKey("PK_Books", (x AnonymousType26_207CBD3FE97773B6) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "Codecs",
            columns: (table ColumnsBuilder) -> AnonymousType2_8BC2069623E58F89(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType2_8BC2069623E58F89]) -> {
                table.PrimaryKey("PK_Codecs", (x AnonymousType2_8BC2069623E58F89) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "Genres",
            columns: (table ColumnsBuilder) -> AnonymousType3_342FEEBDFDEFEE11(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[int64](type: "INTEGER", nullable: false),
                table.Column[string](type: "TEXT", nullable: true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType3_342FEEBDFDEFEE11]) -> {
                table.PrimaryKey("PK_Genres", (x AnonymousType3_342FEEBDFDEFEE11) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "Ladders",
            columns: (table ColumnsBuilder) -> AnonymousType1_1376787EDB06702B(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType1_1376787EDB06702B]) -> {
                table.PrimaryKey("PK_Ladders", (x AnonymousType1_1376787EDB06702B) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "Narrators",
            columns: (table ColumnsBuilder) -> AnonymousType3_AC86E47FD841D8F5(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType3_AC86E47FD841D8F5]) -> {
                table.PrimaryKey("PK_Narrators", (x AnonymousType3_AC86E47FD841D8F5) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "PseudoAsins",
            columns: (table ColumnsBuilder) -> AnonymousType2_058D95B0ADD39D5B(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType2_058D95B0ADD39D5B]) -> {
                table.PrimaryKey("PK_PseudoAsins", (x AnonymousType2_058D95B0ADD39D5B) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "Series",
            columns: (table ColumnsBuilder) -> AnonymousType5_7AEAF24BF543B78F(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType5_7AEAF24BF543B78F]) -> {
                table.PrimaryKey("PK_Series", (x AnonymousType5_7AEAF24BF543B78F) -> x.Id)
            }
        )
        migrationBuilder.CreateTable(
            name: "AuthorBook",
            columns: (table ColumnsBuilder) -> AnonymousType2_E12790B734952712(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType2_E12790B734952712]) -> {
                table.PrimaryKey(
                    "PK_AuthorBook",
                    (x AnonymousType2_E12790B734952712) -> AnonymousType2_E12790B734952712(x.AuthorsId, x.BooksId)
                )
                table.ForeignKey(
                    name: "FK_AuthorBook_Authors_AuthorsId",
                    column: (x AnonymousType2_E12790B734952712) -> x.AuthorsId,
                    principalTable: "Authors",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
                table.ForeignKey(
                    name: "FK_AuthorBook_Books_BooksId",
                    column: (x AnonymousType2_E12790B734952712) -> x.BooksId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "Components",
            columns: (table ColumnsBuilder) -> AnonymousType14_FF860D41E3ABB41B(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int64](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType14_FF860D41E3ABB41B]) -> {
                table.PrimaryKey("PK_Components", (x AnonymousType14_FF860D41E3ABB41B) -> x.Id)
                table.ForeignKey(
                    name: "FK_Components_Books_BookId",
                    column: (x AnonymousType14_FF860D41E3ABB41B) -> x.BookId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "BookCodec",
            columns: (table ColumnsBuilder) -> AnonymousType2_2ED1A904C97A6C5E(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType2_2ED1A904C97A6C5E]) -> {
                table.PrimaryKey(
                    "PK_BookCodec",
                    (x AnonymousType2_2ED1A904C97A6C5E) -> AnonymousType2_2ED1A904C97A6C5E(x.BooksId, x.CodecsId)
                )
                table.ForeignKey(
                    name: "FK_BookCodec_Books_BooksId",
                    column: (x AnonymousType2_2ED1A904C97A6C5E) -> x.BooksId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
                table.ForeignKey(
                    name: "FK_BookCodec_Codecs_CodecsId",
                    column: (x AnonymousType2_2ED1A904C97A6C5E) -> x.CodecsId,
                    principalTable: "Codecs",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "BookGenre",
            columns: (table ColumnsBuilder) -> AnonymousType2_36BC4C343C83B724(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType2_36BC4C343C83B724]) -> {
                table.PrimaryKey(
                    "PK_BookGenre",
                    (x AnonymousType2_36BC4C343C83B724) -> AnonymousType2_36BC4C343C83B724(x.BooksId, x.GenresId)
                )
                table.ForeignKey(
                    name: "FK_BookGenre_Books_BooksId",
                    column: (x AnonymousType2_36BC4C343C83B724) -> x.BooksId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
                table.ForeignKey(
                    name: "FK_BookGenre_Genres_GenresId",
                    column: (x AnonymousType2_36BC4C343C83B724) -> x.GenresId,
                    principalTable: "Genres",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "Rungs",
            columns: (table ColumnsBuilder) -> AnonymousType2_C5FD2299478FCB23(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType2_C5FD2299478FCB23]) -> {
                table.PrimaryKey(
                    "PK_Rungs",
                    (x AnonymousType2_C5FD2299478FCB23) -> AnonymousType2_C5FD2299478FCB23(x.OrderIdx, x.GenreId)
                )
                table.ForeignKey(
                    name: "FK_Rungs_Genres_GenreId",
                    column: (x AnonymousType2_C5FD2299478FCB23) -> x.GenreId,
                    principalTable: "Genres",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "BookLadder",
            columns: (table ColumnsBuilder) -> AnonymousType2_2DACA1B8098556BA(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType2_2DACA1B8098556BA]) -> {
                table.PrimaryKey(
                    "PK_BookLadder",
                    (x AnonymousType2_2DACA1B8098556BA) -> AnonymousType2_2DACA1B8098556BA(x.BooksId, x.LaddersId)
                )
                table.ForeignKey(
                    name: "FK_BookLadder_Books_BooksId",
                    column: (x AnonymousType2_2DACA1B8098556BA) -> x.BooksId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
                table.ForeignKey(
                    name: "FK_BookLadder_Ladders_LaddersId",
                    column: (x AnonymousType2_2DACA1B8098556BA) -> x.LaddersId,
                    principalTable: "Ladders",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "BookNarrator",
            columns: (table ColumnsBuilder) -> AnonymousType2_5C37E34DCB9EA208(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType2_5C37E34DCB9EA208]) -> {
                table.PrimaryKey(
                    "PK_BookNarrator",
                    (x AnonymousType2_5C37E34DCB9EA208) -> AnonymousType2_5C37E34DCB9EA208(x.BooksId, x.NarratorsId)
                )
                table.ForeignKey(
                    name: "FK_BookNarrator_Books_BooksId",
                    column: (x AnonymousType2_5C37E34DCB9EA208) -> x.BooksId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
                table.ForeignKey(
                    name: "FK_BookNarrator_Narrators_NarratorsId",
                    column: (x AnonymousType2_5C37E34DCB9EA208) -> x.NarratorsId,
                    principalTable: "Narrators",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "SeriesBooks",
            columns: (table ColumnsBuilder) -> AnonymousType4_85E32DF1E7B3EAB9(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType4_85E32DF1E7B3EAB9]) -> {
                table.PrimaryKey(
                    "PK_SeriesBooks",
                    (x AnonymousType4_85E32DF1E7B3EAB9) -> AnonymousType2_B06EDD4107A84FF0(x.SeriesId, x.BookId)
                )
                table.ForeignKey(
                    name: "FK_SeriesBooks_Books_BookId",
                    column: (x AnonymousType4_85E32DF1E7B3EAB9) -> x.BookId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
                table.ForeignKey(
                    name: "FK_SeriesBooks_Series_SeriesId",
                    column: (x AnonymousType4_85E32DF1E7B3EAB9) -> x.SeriesId,
                    principalTable: "Series",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "ChapterInfos",
            columns: (table ColumnsBuilder) -> AnonymousType7_282966C510417FA7(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[bool](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType7_282966C510417FA7]) -> {
                table.PrimaryKey("PK_ChapterInfos", (x AnonymousType7_282966C510417FA7) -> x.Id)
                table.ForeignKey(
                    name: "FK_ChapterInfos_Books_BookId",
                    column: (x AnonymousType7_282966C510417FA7) -> x.BookId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict
                )
                table.ForeignKey(
                    name: "FK_ChapterInfos_Components_ComponentId",
                    column: (x AnonymousType7_282966C510417FA7) -> x.ComponentId,
                    principalTable: "Components",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "Conversions",
            columns: (table ColumnsBuilder) -> AnonymousType20_22FF55AEF7804131(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[DateTime](type: "TEXT", nullable: false),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[bool](type: "INTEGER", nullable: true),
                table.Column[bool](type: "INTEGER", nullable: true),
                table.Column[bool](type: "INTEGER", nullable: true),
                table.Column[bool](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: true)
            ),
            constraints: (table CreateTableBuilder[AnonymousType20_22FF55AEF7804131]) -> {
                table.PrimaryKey("PK_Conversions", (x AnonymousType20_22FF55AEF7804131) -> x.Id)
                table.ForeignKey(
                    name: "FK_Conversions_Books_BookId",
                    column: (x AnonymousType20_22FF55AEF7804131) -> x.BookId,
                    principalTable: "Books",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict
                )
                table.ForeignKey(
                    name: "FK_Conversions_Components_ComponentId",
                    column: (x AnonymousType20_22FF55AEF7804131) -> x.ComponentId,
                    principalTable: "Components",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "LadderRung",
            columns: (table ColumnsBuilder) -> AnonymousType3_C09FB73224B6F49F(
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType3_C09FB73224B6F49F]) -> {
                table.PrimaryKey(
                    "PK_LadderRung",
                    (x AnonymousType3_C09FB73224B6F49F) -> AnonymousType3_C09FB73224B6F49F(
                        x.LaddersId,
                        x.RungsOrderIdx,
                        x.RungsGenreId
                    )
                )
                table.ForeignKey(
                    name: "FK_LadderRung_Ladders_LaddersId",
                    column: (x AnonymousType3_C09FB73224B6F49F) -> x.LaddersId,
                    principalTable: "Ladders",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
                table.ForeignKey(
                    name: "FK_LadderRung_Rungs_RungsOrderIdx_RungsGenreId",
                    columns: (x AnonymousType3_C09FB73224B6F49F) -> AnonymousType2_E77C8909FBA75EFF(
                        x.RungsOrderIdx,
                        x.RungsGenreId
                    ),
                    principalTable: "Rungs",
                    principalColumns: []string{"OrderIdx", "GenreId"},
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateTable(
            name: "Chapters",
            columns: (table ColumnsBuilder) -> AnonymousType5_BFE547AA5E768E50(
                table.Column[int32](type: "INTEGER", nullable: false).Annotation("Sqlite:Autoincrement", true),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[int32](type: "INTEGER", nullable: false),
                table.Column[string](type: "TEXT", nullable: true),
                table.Column[int32](type: "INTEGER", nullable: false)
            ),
            constraints: (table CreateTableBuilder[AnonymousType5_BFE547AA5E768E50]) -> {
                table.PrimaryKey("PK_Chapters", (x AnonymousType5_BFE547AA5E768E50) -> x.Id)
                table.ForeignKey(
                    name: "FK_Chapters_ChapterInfos_ChapterInfoId",
                    column: (x AnonymousType5_BFE547AA5E768E50) -> x.ChapterInfoId,
                    principalTable: "ChapterInfos",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade
                )
            }
        )
        migrationBuilder.CreateIndex(name: "IX_AuthorBook_BooksId", table: "AuthorBook", column: "BooksId")
        migrationBuilder.CreateIndex(name: "IX_Authors_Asin", table: "Authors", column: "Asin", unique: true)
        migrationBuilder.CreateIndex(name: "IX_Authors_Name", table: "Authors", column: "Name")
        migrationBuilder.CreateIndex(name: "IX_BookCodec_CodecsId", table: "BookCodec", column: "CodecsId")
        migrationBuilder.CreateIndex(name: "IX_BookGenre_GenresId", table: "BookGenre", column: "GenresId")
        migrationBuilder.CreateIndex(name: "IX_BookLadder_LaddersId", table: "BookLadder", column: "LaddersId")
        migrationBuilder.CreateIndex(name: "IX_BookNarrator_NarratorsId", table: "BookNarrator", column: "NarratorsId")
        migrationBuilder.CreateIndex(name: "IX_Books_Asin", table: "Books", column: "Asin", unique: true)
        migrationBuilder.CreateIndex(name: "IX_Books_PurchaseDate", table: "Books", column: "PurchaseDate")
        migrationBuilder.CreateIndex(
            name: "IX_ChapterInfos_BookId",
            table: "ChapterInfos",
            column: "BookId",
            unique: true
        )
        migrationBuilder.CreateIndex(
            name: "IX_ChapterInfos_ComponentId",
            table: "ChapterInfos",
            column: "ComponentId",
            unique: true
        )
        migrationBuilder.CreateIndex(name: "IX_Chapters_ChapterInfoId", table: "Chapters", column: "ChapterInfoId")
        migrationBuilder.CreateIndex(name: "IX_Components_Asin", table: "Components", column: "Asin", unique: true)
        migrationBuilder.CreateIndex(name: "IX_Components_BookId", table: "Components", column: "BookId")
        migrationBuilder.CreateIndex(
            name: "IX_Conversions_BookId",
            table: "Conversions",
            column: "BookId",
            unique: true
        )
        migrationBuilder.CreateIndex(
            name: "IX_Conversions_ComponentId",
            table: "Conversions",
            column: "ComponentId",
            unique: true
        )
        migrationBuilder.CreateIndex(name: "IX_Genres_ExternalId", table: "Genres", column: "ExternalId", unique: true)
        migrationBuilder.CreateIndex(
            name: "IX_LadderRung_RungsOrderIdx_RungsGenreId",
            table: "LadderRung",
            columns: []string{"RungsOrderIdx", "RungsGenreId"}
        )
        migrationBuilder.CreateIndex(name: "IX_Narrators_Asin", table: "Narrators", column: "Asin", unique: true)
        migrationBuilder.CreateIndex(name: "IX_Narrators_Name", table: "Narrators", column: "Name")
        migrationBuilder.CreateIndex(name: "IX_Rungs_GenreId", table: "Rungs", column: "GenreId")
        migrationBuilder.CreateIndex(name: "IX_Series_Asin", table: "Series", column: "Asin", unique: true)
        migrationBuilder.CreateIndex(name: "IX_SeriesBooks_BookId", table: "SeriesBooks", column: "BookId")
    }

    protected open override func Down(migrationBuilder MigrationBuilder) {
        migrationBuilder.DropTable(name: "Accounts")
        migrationBuilder.DropTable(name: "AuthorBook")
        migrationBuilder.DropTable(name: "BookCodec")
        migrationBuilder.DropTable(name: "BookGenre")
        migrationBuilder.DropTable(name: "BookLadder")
        migrationBuilder.DropTable(name: "BookNarrator")
        migrationBuilder.DropTable(name: "Chapters")
        migrationBuilder.DropTable(name: "Conversions")
        migrationBuilder.DropTable(name: "LadderRung")
        migrationBuilder.DropTable(name: "PseudoAsins")
        migrationBuilder.DropTable(name: "SeriesBooks")
        migrationBuilder.DropTable(name: "Authors")
        migrationBuilder.DropTable(name: "Codecs")
        migrationBuilder.DropTable(name: "Narrators")
        migrationBuilder.DropTable(name: "ChapterInfos")
        migrationBuilder.DropTable(name: "Ladders")
        migrationBuilder.DropTable(name: "Rungs")
        migrationBuilder.DropTable(name: "Series")
        migrationBuilder.DropTable(name: "Components")
        migrationBuilder.DropTable(name: "Genres")
        migrationBuilder.DropTable(name: "Books")
    }
}

internal data class AnonymousType3_E3CAE044C2447EA6(
    Id OperationBuilder[AddColumnOperation],
    Alias OperationBuilder[AddColumnOperation],
    AudibleId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType3_AC86E47FD841D8F5(
    Id OperationBuilder[AddColumnOperation],
    Asin OperationBuilder[AddColumnOperation],
    Name OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType26_207CBD3FE97773B6(
    Id OperationBuilder[AddColumnOperation],
    Asin OperationBuilder[AddColumnOperation],
    Title OperationBuilder[AddColumnOperation],
    Subtitle OperationBuilder[AddColumnOperation],
    PublisherName OperationBuilder[AddColumnOperation],
    PublisherSummary OperationBuilder[AddColumnOperation],
    MerchandisingSummary OperationBuilder[AddColumnOperation],
    AverageRating OperationBuilder[AddColumnOperation],
    RunTimeLengthSeconds OperationBuilder[AddColumnOperation],
    FileSizeBytes OperationBuilder[AddColumnOperation],
    SampleRate OperationBuilder[AddColumnOperation],
    BitRate OperationBuilder[AddColumnOperation],
    FileCodec OperationBuilder[AddColumnOperation],
    DeliveryType OperationBuilder[AddColumnOperation],
    Unabridged OperationBuilder[AddColumnOperation],
    AdultProduct OperationBuilder[AddColumnOperation],
    PurchaseDate OperationBuilder[AddColumnOperation],
    ReleaseDate OperationBuilder[AddColumnOperation],
    Language OperationBuilder[AddColumnOperation],
    CoverImageUrl OperationBuilder[AddColumnOperation],
    CoverImageFile OperationBuilder[AddColumnOperation],
    Sku OperationBuilder[AddColumnOperation],
    SkuLite OperationBuilder[AddColumnOperation],
    LicenseKey OperationBuilder[AddColumnOperation],
    LicenseIv OperationBuilder[AddColumnOperation],
    Removed OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_8BC2069623E58F89(
    Id OperationBuilder[AddColumnOperation],
    Name OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType3_342FEEBDFDEFEE11(
    Id OperationBuilder[AddColumnOperation],
    ExternalId OperationBuilder[AddColumnOperation],
    Name OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType1_1376787EDB06702B(Id OperationBuilder[AddColumnOperation]) { }

internal data class AnonymousType2_058D95B0ADD39D5B(
    Id OperationBuilder[AddColumnOperation],
    LatestId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType5_7AEAF24BF543B78F(
    Id OperationBuilder[AddColumnOperation],
    Asin OperationBuilder[AddColumnOperation],
    Title OperationBuilder[AddColumnOperation],
    Sku OperationBuilder[AddColumnOperation],
    SkuLite OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_E12790B734952712(
    AuthorsId OperationBuilder[AddColumnOperation],
    BooksId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType14_FF860D41E3ABB41B(
    Id OperationBuilder[AddColumnOperation],
    Asin OperationBuilder[AddColumnOperation],
    Title OperationBuilder[AddColumnOperation],
    PartNumber OperationBuilder[AddColumnOperation],
    RunTimeLengthSeconds OperationBuilder[AddColumnOperation],
    FileSizeBytes OperationBuilder[AddColumnOperation],
    SampleRate OperationBuilder[AddColumnOperation],
    BitRate OperationBuilder[AddColumnOperation],
    FileCodec OperationBuilder[AddColumnOperation],
    Sku OperationBuilder[AddColumnOperation],
    SkuLite OperationBuilder[AddColumnOperation],
    LicenseKey OperationBuilder[AddColumnOperation],
    LicenseIv OperationBuilder[AddColumnOperation],
    BookId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_2ED1A904C97A6C5E(
    BooksId OperationBuilder[AddColumnOperation],
    CodecsId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_36BC4C343C83B724(
    BooksId OperationBuilder[AddColumnOperation],
    GenresId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_C5FD2299478FCB23(
    OrderIdx OperationBuilder[AddColumnOperation],
    GenreId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_2DACA1B8098556BA(
    BooksId OperationBuilder[AddColumnOperation],
    LaddersId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_5C37E34DCB9EA208(
    BooksId OperationBuilder[AddColumnOperation],
    NarratorsId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType4_85E32DF1E7B3EAB9(
    SeriesId OperationBuilder[AddColumnOperation],
    BookId OperationBuilder[AddColumnOperation],
    BookNumber OperationBuilder[AddColumnOperation],
    SubNumber OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_B06EDD4107A84FF0(
    SeriesId OperationBuilder[AddColumnOperation],
    BookId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType7_282966C510417FA7(
    Id OperationBuilder[AddColumnOperation],
    BrandIntroDurationMs OperationBuilder[AddColumnOperation],
    BrandOutroDurationMs OperationBuilder[AddColumnOperation],
    RuntimeLengthMs OperationBuilder[AddColumnOperation],
    IsAccurate OperationBuilder[AddColumnOperation],
    BookId OperationBuilder[AddColumnOperation],
    ComponentId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType20_22FF55AEF7804131(
    Id OperationBuilder[AddColumnOperation],
    State OperationBuilder[AddColumnOperation],
    LastUpdate OperationBuilder[AddColumnOperation],
    DownloadFileName OperationBuilder[AddColumnOperation],
    DestDirectory OperationBuilder[AddColumnOperation],
    ConvMode OperationBuilder[AddColumnOperation],
    ConvFormat OperationBuilder[AddColumnOperation],
    Mp4AAudio OperationBuilder[AddColumnOperation],
    AveTrackLengthMinutes OperationBuilder[AddColumnOperation],
    NamedChapters OperationBuilder[AddColumnOperation],
    ChapterMarkAdjusting OperationBuilder[AddColumnOperation],
    PreferEmbChapMarks OperationBuilder[AddColumnOperation],
    VariableBitRate OperationBuilder[AddColumnOperation],
    ReducedBitRate OperationBuilder[AddColumnOperation],
    ShortChapDurSeconds OperationBuilder[AddColumnOperation],
    VeryShortChapDurSeconds OperationBuilder[AddColumnOperation],
    AccountId OperationBuilder[AddColumnOperation],
    Region OperationBuilder[AddColumnOperation],
    BookId OperationBuilder[AddColumnOperation],
    ComponentId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType3_C09FB73224B6F49F(
    LaddersId OperationBuilder[AddColumnOperation],
    RungsOrderIdx OperationBuilder[AddColumnOperation],
    RungsGenreId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType2_E77C8909FBA75EFF(
    RungsOrderIdx OperationBuilder[AddColumnOperation],
    RungsGenreId OperationBuilder[AddColumnOperation]
) { }

internal data class AnonymousType5_BFE547AA5E768E50(
    Id OperationBuilder[AddColumnOperation],
    LengthMs OperationBuilder[AddColumnOperation],
    StartOffsetMs OperationBuilder[AddColumnOperation],
    Title OperationBuilder[AddColumnOperation],
    ChapterInfoId OperationBuilder[AddColumnOperation]
) { }
