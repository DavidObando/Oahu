package Oahu.BooksDatabase

import Microsoft.EntityFrameworkCore
import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.Aux.Logging
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading.Tasks

// PM> Add-Migration InitialCreate -Project BooksDatabase.core -Context BookDbContext
// PM> Add-Migration -Name <mig name> -Project BooksDatabase.core -Context BookDbContext
open class BookDbContext : DbContext {
    init(dirpath string? = nil, filename string? = nil) {
        var dirpath = dirpath
        var filename = filename
        if dirpath == nil {
            dirpath = DefaultDir
        }
        if filename == nil {
            filename = DBFILE
        }
        DbPath = Path.Combine(dirpath, filename)
    }

    prop Books DbSet[Book]
    prop Authors DbSet[Author]
    prop Narrators DbSet[Narrator]
    prop Components DbSet[Component]
    prop Series DbSet[Series]
    prop SeriesBooks DbSet[SeriesBook]
    prop Conversions DbSet[Conversion]
    prop Genres DbSet[Genre]
    prop Ladders DbSet[Ladder]
    prop Rungs DbSet[Rung]
    prop Codecs DbSet[Codec]
    prop Chapters DbSet[Chapter]
    prop ChapterInfos DbSet[ChapterInfo]
    prop Accounts DbSet[Account]

    prop DbPath string {
        get;
        init;
    }

    internal prop PseudoAsins DbSet[PseudoAsin]

    func GetNextPseudoAsin[T]() string? -> GetNextPseudoAsin(typeof(T))

    func GetNextPseudoAsin(t Type) string? {
        let succ = PseudoAsinsValue.TryGetValue(t, out var pseudoAsinId)
        if !succ {
            return nil
        }
        var ent PseudoAsin? = PseudoAsins.Find(pseudoAsinId)
        if ent == nil {
            ent = PseudoAsin{Id: pseudoAsinId}
            PseudoAsins.Add(ent)
        }
        ent.LatestId++
        return ent.LatestId.ToString("D7")
    }

    protected open override func OnConfiguring(options DbContextOptionsBuilder) -> options.UseSqlite(
        "Data Source=$DbPath"
    )

    protected open override func OnModelCreating(modelBuilder ModelBuilder) {
        modelBuilder.Entity[Book]().HasKey((e Book) -> e.Id)
        modelBuilder.Entity[Book]().HasIndex((e Book) -> e.Asin).IsUnique()
        modelBuilder.Entity[Genre]().HasKey((e Genre) -> e.Id)
        modelBuilder.Entity[Genre]().HasIndex((e Genre) -> e.ExternalId).IsUnique()
        modelBuilder.Entity[Author]().HasKey((e Author) -> e.Id)
        modelBuilder.Entity[Author]().HasIndex((e Author) -> e.Asin).IsUnique()
        modelBuilder.Entity[Narrator]().HasKey((e Narrator) -> e.Id)
        modelBuilder.Entity[Narrator]().HasIndex((e Narrator) -> e.Asin).IsUnique()
        modelBuilder.Entity[Component]().HasKey((e Component) -> e.Id)
        modelBuilder.Entity[Component]().HasIndex((e Component) -> e.Asin).IsUnique()
        modelBuilder.Entity[Series]().HasKey((e Series) -> e.Id)
        modelBuilder.Entity[Series]().HasIndex((e Series) -> e.Asin).IsUnique()
        modelBuilder.Entity[Conversion]().HasKey((e Conversion) -> e.Id)
        modelBuilder.Entity[SeriesBook]().HasKey(
            (e SeriesBook) -> AnonymousType2_2D239D5F4EA5A2B3(e.SeriesId, e.BookId)
        )
        modelBuilder.Entity[Ladder]().HasKey((e Ladder) -> e.Id)
        modelBuilder.Entity[Rung]().HasKey((e Rung) -> AnonymousType2_2BA46FADACC93657(e.OrderIdx, e.GenreId))
        modelBuilder.Entity[Codec]().HasKey((e Codec) -> e.Id)
        modelBuilder.Entity[Chapter]().HasKey((e Chapter) -> e.Id)
        modelBuilder.Entity[ChapterInfo]().HasKey((e ChapterInfo) -> e.Id)
        modelBuilder.Entity[Account]().HasKey((e Account) -> e.Id)
        modelBuilder
            .Entity[Book]()
            .HasOne((e Book) -> e.Conversion)
            .WithOne((e Conversion) -> e.Book)
            .HasForeignKey[Conversion]((e Conversion) -> e.BookId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Cascade)
        modelBuilder
            .Entity[Component]()
            .HasOne((e Component) -> e.Book)
            .WithMany((e Book) -> e.Components)
            .HasForeignKey((e Component) -> e.BookId)
            .OnDelete(DeleteBehavior.Cascade)
        modelBuilder
            .Entity[Component]()
            .HasOne((e Component) -> e.Conversion)
            .WithOne((e Conversion) -> e.Component)
            .HasForeignKey[Conversion]((e Conversion) -> e.ComponentId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Cascade)
        modelBuilder
            .Entity[SeriesBook]()
            .HasOne((e SeriesBook) -> e.Book)
            .WithMany((e Book) -> e.Series)
            .HasForeignKey((e SeriesBook) -> e.BookId)
        modelBuilder
            .Entity[SeriesBook]()
            .HasOne((e SeriesBook) -> e.Series)
            .WithMany((e Series) -> e.Books)
            .HasForeignKey((e SeriesBook) -> e.SeriesId)
        modelBuilder.Entity[Rung]().HasOne((e Rung) -> e.Genre).WithMany().HasForeignKey((e Rung) -> e.GenreId)
        modelBuilder.Entity[Narrator]().HasIndex((e Narrator) -> e.Name).IsUnique(false)
        modelBuilder.Entity[Author]().HasIndex((e Author) -> e.Name).IsUnique(false)
        modelBuilder.Entity[Book]().HasIndex((e Book) -> e.PurchaseDate).IsUnique(false)
        modelBuilder
            .Entity[Component]()
            .HasOne((e Component) -> e.ChapterInfo)
            .WithOne((e ChapterInfo) -> e.Component)
            .HasForeignKey[ChapterInfo]((e ChapterInfo) -> e.ComponentId)
            .OnDelete(DeleteBehavior.Cascade)
        modelBuilder
            .Entity[Book]()
            .HasOne((e Book) -> e.ChapterInfo)
            .WithOne((e ChapterInfo) -> e.Book)
            .HasForeignKey[ChapterInfo]((e ChapterInfo) -> e.BookId)
            .OnDelete(DeleteBehavior.Cascade)
        modelBuilder
            .Entity[Chapter]()
            .HasOne((e Chapter) -> e.ChapterInfo)
            .WithMany((e ChapterInfo) -> e.Chapters)
            .HasForeignKey((e Chapter) -> e.ChapterInfoId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Cascade)
        modelBuilder
            .Entity[Chapter]()
            .HasOne((e Chapter) -> e.ParentChapter)
            .WithMany((e Chapter) -> e.Chapters)
            .HasForeignKey((e Chapter) -> e.ParentChapterId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Cascade)
    }

    shared {
        private const SUBDIR string = "data"
        private const DBFILE string = "audiobooks.db"
        private let PseudoAsinsValue Dictionary[Type, EPseudoAsinId] = Dictionary[Type, EPseudoAsinId]{
            typeof(Author): EPseudoAsinId.Author,
            typeof(Narrator): EPseudoAsinId.Narrator
        }
        private prop DefaultDir string -> Path.Combine(ApplEnv.LocalApplDirectory, SUBDIR)

        async func StartupAsync(dirpath string? = nil, filename string? = nil) bool {
            using let logGuard = LogGuard(3, typeof(BookDbContext), () -> "dir=$dirpath, file=$filename")
            using let dbContext = BookDbContext(dirpath, filename)
            let pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync()
            if pendingMigrations.Any() {
                Log(2, typeof(BookDbContext), () -> "with migrations: ${pendingMigrations.Combine()}")
                if !File.Exists(dbContext.DbPath) {
                    Directory.CreateDirectory(Path.GetDirectoryName(dbContext.DbPath)!!)
                }
                await BackupPreviousVersionAsync(dbContext)
                await dbContext.Database.MigrateAsync()
                await CompactAsync(dbContext)
            }
            return dbContext.Database.CanConnect()
        }

        private async func BackupPreviousVersionAsync(dbContext BookDbContext) {
            if !File.Exists(dbContext.DbPath) {
                return
            }
            await Task.Run(
                () -> {
                    try {
                        let dir string? = Path.GetDirectoryName(dbContext.DbPath)
                        let filestub = Path.GetFileNameWithoutExtension(dbContext.DbPath)
                        let ext = Path.GetExtension(dbContext.DbPath)
                        var mig string? = dbContext.Database.GetAppliedMigrations().LastOrDefault()
                        if mig.IsNullOrEmpty() {
                            mig = "(no mig)"
                        }
                        let dest = Path.Combine(dir!!, "$filestub $mig$ext")
                        Log(2, typeof(BookDbContext), () -> "create backup: \"${dest.SubstitUser()}\"")
                        File.Copy(dbContext.DbPath, dest, true)
                    } catch (exc Exception) {
                        Log(1, typeof(BookDbContext), exc.Summary())
                    }
                }
            )
        }

        private async func CompactAsync(dbContext BookDbContext) {
            let fi = FileInfo(dbContext.DbPath)
            var size = fi.Length / int64(1024)
            Log(2, typeof(BookDbContext), () -> "before: $size kB")
            try {
                let n = await dbContext.Database.ExecuteSqlRawAsync("VACUUM")
            } catch (exc Exception) {
                Log(1, typeof(BookDbContext), exc.Summary())
                return
            }
            fi.Refresh()
            size = fi.Length / int64(1024)
            Log(2, typeof(BookDbContext), () -> "after:  $size kB")
        }
    }
}

open class BookDbContextLazyLoad : BookDbContext {
    init(dirpath string? = nil, filename string? = nil) : base(dirpath, filename) { }

    protected open override func OnConfiguring(options DbContextOptionsBuilder) {
        options.UseLazyLoadingProxies()
        base.OnConfiguring(options)
    }
}

internal data class AnonymousType2_2D239D5F4EA5A2B3(SeriesId int32, BookId int32) { }

internal data class AnonymousType2_2BA46FADACC93657(OrderIdx int32, GenreId int32) { }
