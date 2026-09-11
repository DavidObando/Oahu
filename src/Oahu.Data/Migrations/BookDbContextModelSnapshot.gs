package Oahu.BooksDatabase.Migrations

import Microsoft.EntityFrameworkCore
import Microsoft.EntityFrameworkCore.Infrastructure
import Microsoft.EntityFrameworkCore.Metadata.Builders
import Microsoft.EntityFrameworkCore.Storage.ValueConversion
import Oahu.BooksDatabase
import System

@DbContext(typeof(BookDbContext))
internal open partial class BookDbContextModelSnapshot : ModelSnapshot {
    protected open override func BuildModel(modelBuilder ModelBuilder) {
        modelBuilder.HasAnnotation("ProductVersion", "5.0.11")
        modelBuilder.Entity(
            "AuthorBook",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("AuthorsId").HasColumnType("INTEGER")
                b.Property[int32]("BooksId").HasColumnType("INTEGER")
                b.HasKey("AuthorsId", "BooksId")
                b.HasIndex("BooksId")
                b.ToTable("AuthorBook")
            }
        )
        modelBuilder.Entity(
            "BookCodec",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("BooksId").HasColumnType("INTEGER")
                b.Property[int32]("CodecsId").HasColumnType("INTEGER")
                b.HasKey("BooksId", "CodecsId")
                b.HasIndex("CodecsId")
                b.ToTable("BookCodec")
            }
        )
        modelBuilder.Entity(
            "BookGenre",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("BooksId").HasColumnType("INTEGER")
                b.Property[int32]("GenresId").HasColumnType("INTEGER")
                b.HasKey("BooksId", "GenresId")
                b.HasIndex("GenresId")
                b.ToTable("BookGenre")
            }
        )
        modelBuilder.Entity(
            "BookLadder",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("BooksId").HasColumnType("INTEGER")
                b.Property[int32]("LaddersId").HasColumnType("INTEGER")
                b.HasKey("BooksId", "LaddersId")
                b.HasIndex("LaddersId")
                b.ToTable("BookLadder")
            }
        )
        modelBuilder.Entity(
            "BookNarrator",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("BooksId").HasColumnType("INTEGER")
                b.Property[int32]("NarratorsId").HasColumnType("INTEGER")
                b.HasKey("BooksId", "NarratorsId")
                b.HasIndex("NarratorsId")
                b.ToTable("BookNarrator")
            }
        )
        modelBuilder.Entity(
            "LadderRung",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("LaddersId").HasColumnType("INTEGER")
                b.Property[int32]("RungsOrderIdx").HasColumnType("INTEGER")
                b.Property[int32]("RungsGenreId").HasColumnType("INTEGER")
                b.HasKey("LaddersId", "RungsOrderIdx", "RungsGenreId")
                b.HasIndex("RungsOrderIdx", "RungsGenreId")
                b.ToTable("LadderRung")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Account",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[string]("Alias").HasColumnType("TEXT")
                b.Property[string]("AudibleId").HasColumnType("TEXT")
                b.HasKey("Id")
                b.ToTable("Accounts")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Author",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[string]("Asin").HasColumnType("TEXT")
                b.Property[string]("Name").HasColumnType("TEXT")
                b.HasKey("Id")
                b.HasIndex("Asin").IsUnique()
                b.HasIndex("Name")
                b.ToTable("Authors")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Book",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[bool?]("AdultProduct").HasColumnType("INTEGER")
                b.Property[string]("Asin").HasColumnType("TEXT")
                b.Property[float32?]("AverageRating").HasColumnType("REAL")
                b.Property[int32?]("BitRate").HasColumnType("INTEGER")
                b.Property[string]("CoverImageFile").HasColumnType("TEXT")
                b.Property[string]("CoverImageUrl").HasColumnType("TEXT")
                b.Property[bool?]("Deleted").HasColumnType("INTEGER")
                b.Property[int32?]("DeliveryType").HasColumnType("INTEGER")
                b.Property[int32?]("DownloadQuality").HasColumnType("INTEGER")
                b.Property[int32?]("FileCodec").HasColumnType("INTEGER")
                b.Property[int64?]("FileSizeBytes").HasColumnType("INTEGER")
                b.Property[string]("Language").HasColumnType("TEXT")
                b.Property[string]("LicenseIv").HasColumnType("TEXT")
                b.Property[string]("LicenseKey").HasColumnType("TEXT")
                b.Property[string]("MerchandisingSummary").HasColumnType("TEXT")
                b.Property[string]("PublisherName").HasColumnType("TEXT")
                b.Property[string]("PublisherSummary").HasColumnType("TEXT")
                b.Property[DateTime?]("PurchaseDate").HasColumnType("TEXT")
                b.Property[DateTime?]("ReleaseDate").HasColumnType("TEXT")
                b.Property[int32?]("RunTimeLengthSeconds").HasColumnType("INTEGER")
                b.Property[int32?]("SampleRate").HasColumnType("INTEGER")
                b.Property[string]("Sku").HasColumnType("TEXT")
                b.Property[string]("SkuLite").HasColumnType("TEXT")
                b.Property[string]("Subtitle").HasColumnType("TEXT")
                b.Property[string]("Title").HasColumnType("TEXT")
                b.Property[bool?]("Unabridged").HasColumnType("INTEGER")
                b.HasKey("Id")
                b.HasIndex("Asin").IsUnique()
                b.HasIndex("PurchaseDate")
                b.ToTable("Books")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Chapter",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[int32?]("ChapterInfoId").HasColumnType("INTEGER")
                b.Property[int32]("LengthMs").HasColumnType("INTEGER")
                b.Property[int32?]("ParentChapterId").HasColumnType("INTEGER")
                b.Property[int32]("StartOffsetMs").HasColumnType("INTEGER")
                b.Property[string]("Title").HasColumnType("TEXT")
                b.HasKey("Id")
                b.HasIndex("ChapterInfoId")
                b.HasIndex("ParentChapterId")
                b.ToTable("Chapters")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.ChapterInfo",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[int32?]("BookId").HasColumnType("INTEGER")
                b.Property[int32]("BrandIntroDurationMs").HasColumnType("INTEGER")
                b.Property[int32]("BrandOutroDurationMs").HasColumnType("INTEGER")
                b.Property[int32?]("ComponentId").HasColumnType("INTEGER")
                b.Property[bool?]("IsAccurate").HasColumnType("INTEGER")
                b.Property[int32]("RuntimeLengthMs").HasColumnType("INTEGER")
                b.HasKey("Id")
                b.HasIndex("BookId").IsUnique()
                b.HasIndex("ComponentId").IsUnique()
                b.ToTable("ChapterInfos")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Codec",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[int32]("Name").HasColumnType("INTEGER")
                b.HasKey("Id")
                b.ToTable("Codecs")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Component",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[string]("Asin").HasColumnType("TEXT")
                b.Property[int32?]("BitRate").HasColumnType("INTEGER")
                b.Property[int32]("BookId").HasColumnType("INTEGER")
                b.Property[int32?]("DownloadQuality").HasColumnType("INTEGER")
                b.Property[int32?]("FileCodec").HasColumnType("INTEGER")
                b.Property[int64?]("FileSizeBytes").HasColumnType("INTEGER")
                b.Property[string]("LicenseIv").HasColumnType("TEXT")
                b.Property[string]("LicenseKey").HasColumnType("TEXT")
                b.Property[int32]("PartNumber").HasColumnType("INTEGER")
                b.Property[int32?]("RunTimeLengthSeconds").HasColumnType("INTEGER")
                b.Property[int32?]("SampleRate").HasColumnType("INTEGER")
                b.Property[string]("Sku").HasColumnType("TEXT")
                b.Property[string]("SkuLite").HasColumnType("TEXT")
                b.Property[string]("Title").HasColumnType("TEXT")
                b.HasKey("Id")
                b.HasIndex("Asin").IsUnique()
                b.HasIndex("BookId")
                b.ToTable("Components")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Conversion",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[int32]("AccountId").HasColumnType("INTEGER")
                b.Property[int32?]("AveTrackLengthMinutes").HasColumnType("INTEGER")
                b.Property[int32?]("BookId").HasColumnType("INTEGER")
                b.Property[bool?]("ChapterMarkAdjusting").HasColumnType("INTEGER")
                b.Property[int32?]("ComponentId").HasColumnType("INTEGER")
                b.Property[int32?]("ConvFormat").HasColumnType("INTEGER")
                b.Property[int32?]("ConvMode").HasColumnType("INTEGER")
                b.Property[string]("DestDirectory").HasColumnType("TEXT")
                b.Property[string]("DownloadFileName").HasColumnType("TEXT")
                b.Property[DateTime]("LastUpdate").HasColumnType("TEXT")
                b.Property[int32?]("Mp4AAudio").HasColumnType("INTEGER")
                b.Property[bool?]("NamedChapters").HasColumnType("INTEGER")
                b.Property[bool?]("PreferEmbChapMarks").HasColumnType("INTEGER")
                b.Property[int32?]("ReducedBitRate").HasColumnType("INTEGER")
                b.Property[int32]("Region").HasColumnType("INTEGER")
                b.Property[int32?]("ShortChapDurSeconds").HasColumnType("INTEGER")
                b.Property[int32]("State").HasColumnType("INTEGER")
                b.Property[bool?]("VariableBitRate").HasColumnType("INTEGER")
                b.Property[int32?]("VeryShortChapDurSeconds").HasColumnType("INTEGER")
                b.HasKey("Id")
                b.HasIndex("BookId").IsUnique()
                b.HasIndex("ComponentId").IsUnique()
                b.ToTable("Conversions")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Genre",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[int64]("ExternalId").HasColumnType("INTEGER")
                b.Property[string]("Name").HasColumnType("TEXT")
                b.HasKey("Id")
                b.HasIndex("ExternalId").IsUnique()
                b.ToTable("Genres")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Ladder",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.HasKey("Id")
                b.ToTable("Ladders")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Narrator",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[string]("Asin").HasColumnType("TEXT")
                b.Property[string]("Name").HasColumnType("TEXT")
                b.HasKey("Id")
                b.HasIndex("Asin").IsUnique()
                b.HasIndex("Name")
                b.ToTable("Narrators")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.PseudoAsin",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").HasColumnType("INTEGER")
                b.Property[int32]("LatestId").HasColumnType("INTEGER")
                b.HasKey("Id")
                b.ToTable("PseudoAsins")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Rung",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("OrderIdx").HasColumnType("INTEGER")
                b.Property[int32]("GenreId").HasColumnType("INTEGER")
                b.HasKey("OrderIdx", "GenreId")
                b.HasIndex("GenreId")
                b.ToTable("Rungs")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Series",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                b.Property[string]("Asin").HasColumnType("TEXT")
                b.Property[string]("Sku").HasColumnType("TEXT")
                b.Property[string]("SkuLite").HasColumnType("TEXT")
                b.Property[string]("Title").HasColumnType("TEXT")
                b.HasKey("Id")
                b.HasIndex("Asin").IsUnique()
                b.ToTable("Series")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.SeriesBook",
            (b EntityTypeBuilder) -> {
                b.Property[int32]("SeriesId").HasColumnType("INTEGER")
                b.Property[int32]("BookId").HasColumnType("INTEGER")
                b.Property[int32]("BookNumber").HasColumnType("INTEGER")
                b.Property[string]("Sequence").HasColumnType("TEXT")
                b.Property[int32?]("Sort").HasColumnType("INTEGER")
                b.Property[int32?]("SubNumber").HasColumnType("INTEGER")
                b.HasKey("SeriesId", "BookId")
                b.HasIndex("BookId")
                b.ToTable("SeriesBooks")
            }
        )
        modelBuilder.Entity(
            "AuthorBook",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Author", nil)
                    .WithMany()
                    .HasForeignKey("AuthorsId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b
                    .HasOne("Oahu.BooksDatabase.Book", nil)
                    .WithMany()
                    .HasForeignKey("BooksId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
            }
        )
        modelBuilder.Entity(
            "BookCodec",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Book", nil)
                    .WithMany()
                    .HasForeignKey("BooksId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b
                    .HasOne("Oahu.BooksDatabase.Codec", nil)
                    .WithMany()
                    .HasForeignKey("CodecsId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
            }
        )
        modelBuilder.Entity(
            "BookGenre",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Book", nil)
                    .WithMany()
                    .HasForeignKey("BooksId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b
                    .HasOne("Oahu.BooksDatabase.Genre", nil)
                    .WithMany()
                    .HasForeignKey("GenresId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
            }
        )
        modelBuilder.Entity(
            "BookLadder",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Book", nil)
                    .WithMany()
                    .HasForeignKey("BooksId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b
                    .HasOne("Oahu.BooksDatabase.Ladder", nil)
                    .WithMany()
                    .HasForeignKey("LaddersId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
            }
        )
        modelBuilder.Entity(
            "BookNarrator",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Book", nil)
                    .WithMany()
                    .HasForeignKey("BooksId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b
                    .HasOne("Oahu.BooksDatabase.Narrator", nil)
                    .WithMany()
                    .HasForeignKey("NarratorsId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
            }
        )
        modelBuilder.Entity(
            "LadderRung",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Ladder", nil)
                    .WithMany()
                    .HasForeignKey("LaddersId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b
                    .HasOne("Oahu.BooksDatabase.Rung", nil)
                    .WithMany()
                    .HasForeignKey("RungsOrderIdx", "RungsGenreId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Chapter",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.ChapterInfo", "ChapterInfo")
                    .WithMany("Chapters")
                    .HasForeignKey("ChapterInfoId")
                    .OnDelete(DeleteBehavior.Cascade)
                b
                    .HasOne("Oahu.BooksDatabase.Chapter", "ParentChapter")
                    .WithMany("Chapters")
                    .HasForeignKey("ParentChapterId")
                    .OnDelete(DeleteBehavior.Cascade)
                b.Navigation("ChapterInfo")
                b.Navigation("ParentChapter")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.ChapterInfo",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Book", "Book")
                    .WithOne("ChapterInfo")
                    .HasForeignKey("Oahu.BooksDatabase.ChapterInfo", "BookId")
                    .OnDelete(DeleteBehavior.Cascade)
                b
                    .HasOne("Oahu.BooksDatabase.Component", "Component")
                    .WithOne("ChapterInfo")
                    .HasForeignKey("Oahu.BooksDatabase.ChapterInfo", "ComponentId")
                    .OnDelete(DeleteBehavior.Cascade)
                b.Navigation("Book")
                b.Navigation("Component")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Component",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Book", "Book")
                    .WithMany("Components")
                    .HasForeignKey("BookId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b.Navigation("Book")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Conversion",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Book", "Book")
                    .WithOne("Conversion")
                    .HasForeignKey("Oahu.BooksDatabase.Conversion", "BookId")
                    .OnDelete(DeleteBehavior.Cascade)
                b
                    .HasOne("Oahu.BooksDatabase.Component", "Component")
                    .WithOne("Conversion")
                    .HasForeignKey("Oahu.BooksDatabase.Conversion", "ComponentId")
                    .OnDelete(DeleteBehavior.Cascade)
                b.Navigation("Book")
                b.Navigation("Component")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Rung",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Genre", "Genre")
                    .WithMany()
                    .HasForeignKey("GenreId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b.Navigation("Genre")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.SeriesBook",
            (b EntityTypeBuilder) -> {
                b
                    .HasOne("Oahu.BooksDatabase.Book", "Book")
                    .WithMany("Series")
                    .HasForeignKey("BookId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b
                    .HasOne("Oahu.BooksDatabase.Series", "Series")
                    .WithMany("Books")
                    .HasForeignKey("SeriesId")
                    .OnDelete(DeleteBehavior.Cascade)
                    .IsRequired()
                b.Navigation("Book")
                b.Navigation("Series")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Book",
            (b EntityTypeBuilder) -> {
                b.Navigation("ChapterInfo")
                b.Navigation("Components")
                b.Navigation("Conversion")
                b.Navigation("Series")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Chapter",
            (b EntityTypeBuilder) -> {
                b.Navigation("Chapters")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.ChapterInfo",
            (b EntityTypeBuilder) -> {
                b.Navigation("Chapters")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Component",
            (b EntityTypeBuilder) -> {
                b.Navigation("ChapterInfo")
                b.Navigation("Conversion")
            }
        )
        modelBuilder.Entity(
            "Oahu.BooksDatabase.Series",
            (b EntityTypeBuilder) -> {
                b.Navigation("Books")
            }
        )
    }
}
