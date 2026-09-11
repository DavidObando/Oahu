package Oahu.Cli.Server.Tools

import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Server.Capabilities
import System
import System.Collections.Generic
import System.Globalization
import System.Linq
import System.Threading
import System.Threading.Tasks

/// All tool implementations the `oahu-cli serve` surface exposes, mapped 1:1
/// against the table in `docs/OAHU_CLI_DESIGN.md` §15.1.
///
/// These methods <b>do not</b> contain auth or audit logic — that's owned by
/// (cref:Hosting.ToolDispatcher). Capability classes are owned by the
/// (cref:OahuCapabilityAttribute) on each method (single source of truth
/// for both stdio MCP tool registration and the REST routes).
///
/// All methods return plain CLR types serialized via `System.Text.Json`; both
/// transports get the same JSON shape.
class OahuTools {
    private let authService IAuthService
    private let libraryService ILibraryService
    private let queueService IQueueService
    private let jobService IJobService
    private let configService IConfigService
    private let doctorService IDoctorService

    init(
        authService IAuthService,
        libraryService ILibraryService,
        queueService IQueueService,
        jobService IJobService,
        configService IConfigService,
        doctorService IDoctorService
    ) {
        this.authService = authService
        this.libraryService = libraryService
        this.queueService = queueService
        this.jobService = jobService
        this.configService = configService
        this.doctorService = doctorService
    }

    // ---- AUTH ------------------------------------------------------------
    @OahuCapability(CapabilityClass.Safe)
    async func AuthStatusAsync(ct CancellationToken = default(CancellationToken)) object {
        let sessions = await authService.ListSessionsAsync(ct).ConfigureAwait(false)
        let active AuthSession? = await authService.GetActiveAsync(ct).ConfigureAwait(false)
        return AnonymousType2_E5A9FB6D59E3C77C(
            if active == nil {
                default(object?)
            } else {
                ToAuth(active)
            },
            sessions.Select(ToAuth).ToArray()
        )
    }

    // ---- LIBRARY ---------------------------------------------------------
    @OahuCapability(CapabilityClass.Safe)
    async func LibraryListAsync(
        filter string? = nil,
        limit int32? = nil,
        ct CancellationToken = default(CancellationToken)
    ) object {
        let f = if string.IsNullOrWhiteSpace(filter) {
            default(LibraryFilter?)
        } else {
            LibraryFilter{Search: filter}
        }
        let items = await libraryService.ListAsync(f, ct).ConfigureAwait(false)
        var seq IEnumerable[LibraryItem] = items
        if limit is {} n && n >= 0 {
            seq = seq.Take(n)
        }
        return AnonymousType2_956813145F43AA74(seq.Select(ToLib).ToArray(), items.Count)
    }

    @OahuCapability(CapabilityClass.Safe)
    async func LibraryShowAsync(asin string, ct CancellationToken = default(CancellationToken)) object {
        if string.IsNullOrWhiteSpace(asin) {
            throw ArgumentException("asin is required.", "asin")
        }
        let item LibraryItem? = await libraryService.GetAsync(asin, ct).ConfigureAwait(false)
        if item == nil {
            throw KeyNotFoundException("No library item with ASIN '$asin'.")
        }
        return ToLib(item)
    }

    @OahuCapability(CapabilityClass.Expensive)
    async func LibrarySyncAsync(profile string? = nil, ct CancellationToken = default(CancellationToken)) object {
        let alias = profile ?? string.Empty
        let added = await libraryService.SyncAsync(alias, ct).ConfigureAwait(false)
        return AnonymousType1_17CFA0C5C5D43F37(added)
    }

    // ---- QUEUE -----------------------------------------------------------
    @OahuCapability(CapabilityClass.Safe)
    async func QueueListAsync(ct CancellationToken = default(CancellationToken)) object {
        let items = await queueService.ListAsync(ct).ConfigureAwait(false)
        return AnonymousType2_956813145F43AA74(items.Select(ToQueue).ToArray(), items.Count)
    }

    @OahuCapability(CapabilityClass.Mutating)
    async func QueueAddAsync(
        asins[]?string,
        title string? = nil,
        quality string? = nil,
        profile string? = nil,
        ct CancellationToken = default(CancellationToken)
    ) object {
        if asins == nil || asins.Length == 0 {
            throw ArgumentException("at least one asin is required.", "asins")
        }
        let q = ParseQuality(quality)
        let added = List[string]()
        let skipped = List[string]()
        for raw in asins {
            let asin = raw?.Trim()
            if string.IsNullOrEmpty(asin) {
                continue
            }
            let entry = QueueEntry{
                Asin: asin,
                Title: (
                    (
                        if asins.Length == 1 {
                            title
                        } else {
                            default(string?)
                        }
                    ) ?? asin
                ),
                Quality: q,
                ProfileAlias: profile
            }
            if await queueService.AddAsync(entry, ct).ConfigureAwait(false) {
                added.Add(asin)
            } else {
                skipped.Add(asin)
            }
        }
        return AnonymousType2_550C07EABA52BBC1(added.ToArray(), skipped.ToArray())
    }

    @OahuCapability(CapabilityClass.Mutating)
    async func QueueRemoveAsync(asins[]?string, ct CancellationToken = default(CancellationToken)) object {
        if asins == nil || asins.Length == 0 {
            throw ArgumentException("at least one asin is required.", "asins")
        }
        let removed = List[string]()
        let missed = List[string]()
        for asin in asins {
            if await queueService.RemoveAsync(asin, ct).ConfigureAwait(false) {
                removed.Add(asin)
            } else {
                missed.Add(asin)
            }
        }
        return AnonymousType2_8A7DDA38274957D0(removed.ToArray(), missed.ToArray())
    }

    @OahuCapability(CapabilityClass.Destructive)
    async func QueueClearAsync(confirm bool, ct CancellationToken = default(CancellationToken)) object {
        let items = await queueService.ListAsync(ct).ConfigureAwait(false)
        let n = items.Count
        await queueService.ClearAsync(ct).ConfigureAwait(false)
        return AnonymousType1_D432BCBCA3059D90(n)
    }

    // ---- JOBS / DOWNLOAD -------------------------------------------------
    @OahuCapability(CapabilityClass.Expensive)
    async func DownloadAsync(
        asins[]?string,
        quality string? = nil,
        profile string? = nil,
        exportToAax bool = false,
        outputDir string? = nil,
        ct CancellationToken = default(CancellationToken)
    ) object {
        if asins == nil || asins.Length == 0 {
            throw ArgumentException("at least one asin is required.", "asins")
        }
        let q = ParseQuality(quality)
        let accepted = List[object]()
        for raw in asins {
            let asin = raw?.Trim()
            if string.IsNullOrEmpty(asin) {
                continue
            }
            // Best-effort title lookup so the job record / observers see something useful.
            var title = asin
            try {
                let item LibraryItem? = await libraryService.GetAsync(asin, ct).ConfigureAwait(false)
                if item != nil {
                    title = item.Title
                }
            } catch {
                // ignore — fall back to ASIN.

            }
            let req = JobRequest{
                Asin: asin,
                Title: title,
                Quality: q,
                ProfileAlias: profile,
                ExportToAax: exportToAax,
                OutputDir: outputDir
            }
            await jobService.SubmitAsync(req, ct).ConfigureAwait(false)
            accepted.Add(AnonymousType3_3071DF11A08A131F(req.Id, asin, title))
        }
        return AnonymousType1_5AB257F99205C311(accepted.ToArray())
    }

    @OahuCapability(CapabilityClass.Safe)
    func JobsStatusAsync(jobId string? = nil, ct CancellationToken = default(CancellationToken)) Task[object] {
        if !string.IsNullOrWhiteSpace(jobId) {
            let snap JobSnapshot? = jobService.GetSnapshot(jobId)
            return Task.FromResult[object](
                AnonymousType1_C37359C934E9B7ED(
                    if snap == nil {
                        default(object?)
                    } else {
                        ToSnapshot(snap)
                    }
                )
            )
        }
        let snaps = jobService.ListActive()
        return Task.FromResult[object](AnonymousType2_26140CE6B2D70CEF(snaps.Select(ToSnapshot).ToArray(), snaps.Count))
    }

    @OahuCapability(CapabilityClass.Mutating)
    func JobsCancelAsync(jobId string, ct CancellationToken = default(CancellationToken)) Task[object] {
        if string.IsNullOrWhiteSpace(jobId) {
            throw ArgumentException("jobId is required.", "jobId")
        }
        let ok = jobService.Cancel(jobId)
        return Task.FromResult[object](AnonymousType1_1C77DBAF0B13F989(ok))
    }

    // ---- HISTORY ---------------------------------------------------------
    @OahuCapability(CapabilityClass.Safe)
    async func HistoryListAsync(limit int32? = nil, ct CancellationToken = default(CancellationToken)) object {
        let rows = List[JobRecord]()
        await for r in jobService.ReadHistoryAsync(ct).ConfigureAwait(false) {
            rows.Add(r)
        }
        var seq IEnumerable[JobRecord] = rows
        if limit is {} n && n >= 0 {
            // history.jsonl is append-order; "limit" returns the most-recent N.
            seq = seq.Skip(Math.Max(0, rows.Count - n))
        }
        return AnonymousType2_956813145F43AA74(seq.Select(ToHistory).ToArray(), rows.Count)
    }

    @OahuCapability(CapabilityClass.Safe)
    async func HistoryShowAsync(jobId string, ct CancellationToken = default(CancellationToken)) object {
        if string.IsNullOrWhiteSpace(jobId) {
            throw ArgumentException("jobId is required.", "jobId")
        }
        await for r in jobService.ReadHistoryAsync(ct).ConfigureAwait(false) {
            if string.Equals(r.Id, jobId, StringComparison.Ordinal) {
                return ToHistory(r)
            }
        }
        throw KeyNotFoundException("No history record with jobId '$jobId'.")
    }

    // history_delete deferred to post-1.0 (would need rewrite-then-rename of jsonl).
    // ---- DOCTOR ----------------------------------------------------------
    @OahuCapability(CapabilityClass.Safe)
    async func DoctorAsync(ct CancellationToken = default(CancellationToken)) object {
        let report = await doctorService.RunAsync(nil, ct).ConfigureAwait(false)
        return AnonymousType3_106C959C89CE327E(
            report.HasErrors,
            report.HasWarnings,
            report
                .Checks
                .Select(
                (c DoctorCheck) -> AnonymousType5_60D22B8337229951(
                    c.Id,
                    c.Title,
                    c.Severity.ToString(),
                    c.Message,
                    c.Hint
                )
            )
                .ToArray()
        )
    }

    // ---- CONFIG ----------------------------------------------------------
    @OahuCapability(CapabilityClass.Safe)
    async func ConfigGetAsync(key string? = nil, ct CancellationToken = default(CancellationToken)) object {
        let cfg = await configService.LoadAsync(ct).ConfigureAwait(false)
        let dict = ConfigToDict(cfg)
        if string.IsNullOrWhiteSpace(key) {
            return AnonymousType2_79C45CAF27E90B9C(dict, configService.Path)
        }
        if !dict.TryGetValue(key, out var v) {
            throw KeyNotFoundException("Unknown config key '$key'.")
        }
        return AnonymousType2_AA484FA13E46DAA8(key, v)
    }

    @OahuCapability(CapabilityClass.Mutating)
    async func ConfigSetAsync(key string, value string, ct CancellationToken = default(CancellationToken)) object {
        if string.IsNullOrWhiteSpace(key) {
            throw ArgumentException("key is required.", "key")
        }
        let cfg = await configService.LoadAsync(ct).ConfigureAwait(false)
        let updated = ApplyConfig(cfg, key, value)
        await configService.SaveAsync(updated, ct).ConfigureAwait(false)
        return AnonymousType2_AA484FA13E46DAA8(key, ConfigToDict(updated)[key])
    }

    shared {
        // ---- helpers ---------------------------------------------------------
        private func ToAuth(s AuthSession) object -> AnonymousType7_89FF380C8D19EED5(
            s.ProfileAlias,
            s.Region.ToString(),
            s.AccountId,
            s.AccountName,
            s.DeviceName,
            s.ExpiresAt,
            s.IsExpired
        )

        private func ToLib(i LibraryItem) object -> AnonymousType10_B9BA54098F65E899(
            i.Asin,
            i.Title,
            i.Subtitle,
            i.Authors,
            i.Narrators,
            i.Series,
            i.SeriesPosition,
            i.Runtime?.TotalMinutes,
            i.PurchaseDate,
            i.IsAvailable
        )

        private func ToQueue(e QueueEntry) object -> AnonymousType5_EA23B2AE57F30DA3(
            e.Asin,
            e.Title,
            e.Quality.ToString(),
            e.AddedAt,
            e.ProfileAlias
        )

        private func ToSnapshot(s JobSnapshot) object -> AnonymousType10_53F172C3483AC3F7(
            s.JobId,
            s.Asin,
            s.Title,
            s.Phase.ToString(),
            s.Progress,
            s.Message,
            s.StartedAt,
            s.UpdatedAt,
            s.Quality?.ToString(),
            s.ProfileAlias
        )

        private func ToHistory(r JobRecord) object -> AnonymousType9_87954055FB027B33(
            r.Id,
            r.Asin,
            r.Title,
            r.TerminalPhase.ToString(),
            r.StartedAt,
            r.CompletedAt,
            r.ErrorMessage,
            r.ProfileAlias,
            r.Quality?.ToString()
        )

        private func ParseQuality(raw string?) DownloadQuality {
            if string.IsNullOrWhiteSpace(raw) {
                return DownloadQuality.High
            }
            if Enum.TryParse[DownloadQuality](raw, ignoreCase: true, out var q) {
                return q
            }
            throw ArgumentException("Invalid quality '$raw'. Expected: High, Normal, Low.")
        }

        private func ConfigToDict(cfg OahuConfig) IDictionary[string, object?] -> Dictionary[string, object?](
            StringComparer.Ordinal
        ){
            ["DownloadDirectory"] = cfg.DownloadDirectory,
            ["DefaultQuality"] = cfg.DefaultQuality.ToString(),
            ["MaxParallelJobs"] = cfg.MaxParallelJobs,
            ["KeepEncryptedFiles"] = cfg.KeepEncryptedFiles,
            ["Theme"] = cfg.Theme
        }

        private func ApplyConfig(cfg OahuConfig, key string, value string) OahuConfig -> switch key {
            case "DownloadDirectory": cfg with{DownloadDirectory = value}
            case "DefaultQuality": cfg with{DefaultQuality = ParseQuality(value)}
            case "MaxParallelJobs": cfg with{MaxParallelJobs = int32.Parse(value, CultureInfo.InvariantCulture)}
            case "KeepEncryptedFiles": cfg with{KeepEncryptedFiles = bool.Parse(value)}
            case "Theme": cfg with{
                Theme = if string.IsNullOrEmpty(value) {
                    default(string?)
                } else {
                    value
                }
            }
            default: throw KeyNotFoundException("Unknown config key '$key'.")
        }
    }
}

internal data class AnonymousType2_E5A9FB6D59E3C77C(active object?, sessions[]object) { }

internal data class AnonymousType2_956813145F43AA74(items[]object, total int32) { }

internal data class AnonymousType1_17CFA0C5C5D43F37(newItems int32) { }

internal data class AnonymousType2_550C07EABA52BBC1(added[]string, skipped[]string) { }

internal data class AnonymousType2_8A7DDA38274957D0(removed[]string, missing[]string) { }

internal data class AnonymousType1_D432BCBCA3059D90(removed int32) { }

internal data class AnonymousType3_3071DF11A08A131F(jobId string, asin string, title string) { }

internal data class AnonymousType1_5AB257F99205C311(accepted[]object) { }

internal data class AnonymousType1_C37359C934E9B7ED(job object?) { }

internal data class AnonymousType2_26140CE6B2D70CEF(jobs[]object, total int32) { }

internal data class AnonymousType1_1C77DBAF0B13F989(canceled bool) { }

internal data class AnonymousType5_60D22B8337229951(
    id string,
    title string,
    severity string,
    message string,
    hint string?
) { }

internal data class AnonymousType3_106C959C89CE327E(
    hasErrors bool,
    hasWarnings bool,
    checks[]AnonymousType5_60D22B8337229951
) { }

internal data class AnonymousType2_79C45CAF27E90B9C(config IDictionary[string, object?], path string) { }

internal data class AnonymousType2_AA484FA13E46DAA8(key string, value object?) { }

internal data class AnonymousType7_89FF380C8D19EED5(
    profileAlias string,
    region string,
    accountId string,
    accountName string?,
    deviceName string?,
    expiresAt DateTimeOffset?,
    isExpired bool
) { }

internal data class AnonymousType10_B9BA54098F65E899(
    asin string,
    title string,
    subtitle string?,
    authors[]string,
    narrators[]string,
    series string?,
    seriesPosition float64?,
    runtimeMinutes float64?,
    purchaseDate DateTimeOffset?,
    isAvailable bool
) { }

internal data class AnonymousType5_EA23B2AE57F30DA3(
    asin string,
    title string,
    quality string,
    addedAt DateTimeOffset,
    profileAlias string?
) { }

internal data class AnonymousType10_53F172C3483AC3F7(
    jobId string,
    asin string,
    title string,
    phase string,
    progress float64?,
    message string?,
    startedAt DateTimeOffset,
    updatedAt DateTimeOffset,
    quality string?,
    profileAlias string?
) { }

internal data class AnonymousType9_87954055FB027B33(
    id string,
    asin string,
    title string,
    terminalPhase string,
    startedAt DateTimeOffset,
    completedAt DateTimeOffset,
    errorMessage string?,
    profileAlias string?,
    quality string?
) { }
