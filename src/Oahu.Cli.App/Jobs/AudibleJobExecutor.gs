package Oahu.Cli.App.Jobs

import System
import System.Collections.Generic
import System.Linq
import System.Runtime.CompilerServices
import System.Threading
import System.Threading.Channels
import System.Threading.Tasks
import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.BooksDatabase
import Oahu.Cli.App.Core
import Oahu.Cli.App.Models
import Oahu.Common.Util
import Oahu.Core
import SystemObject = System.Object
import System.IO

/// Real (cref:IJobExecutor): drives (cref:DownloadDecryptJob{T})
/// against the singleton (cref:AudibleClient) exposed by
/// (cref:CoreEnvironment).
///
/// Bridges Core's push-based progress ((cref:IProgress{T}) +
/// `OnNewStateCallback(Conversion)`) onto the pull-based
/// (cref:IAsyncEnumerable{T}) the scheduler expects: progress events are
/// translated to (cref:JobUpdate) records and forwarded through a
/// bounded channel; the run task is awaited in the background and the
/// terminal phase is appended once it finishes.
///
/// Phase 4c.1 only handles download + decrypt (`convertAction = null`).
/// AAX export ("Exporting") is wired in 4c.2 via the `convert` command.
class AudibleJobExecutor : IJobExecutor {
    private let clientFactory() -> AudibleClient
    private let downloadSettingsFactory() -> IDownloadSettings
    private let exportSettingsFactory() -> IExportSettings
    private let logger ILogger

    convenience init(logger ILogger[AudibleJobExecutor]? = nil) {
        init(
            () -> CoreEnvironment.Client,
            func () IDownloadSettings {
                return CoreEnvironment.Settings.DownloadSettings
            },
            func () IExportSettings {
                return CoreEnvironment.Settings.ExportSettings
            },
            logger
        )
    }

    init(
        clientFactory() -> AudibleClient,
        downloadSettingsFactory() -> IDownloadSettings,
        exportSettingsFactory(() -> IExportSettings)? = nil,
        logger ILogger[AudibleJobExecutor]? = nil
    ) {
        this.clientFactory = clientFactory ?? throw ArgumentNullException("clientFactory")
        this.downloadSettingsFactory = downloadSettingsFactory ?? throw ArgumentNullException("downloadSettingsFactory")
        this.exportSettingsFactory = exportSettingsFactory ?? (() -> CoreEnvironment.Settings.ExportSettings)
        this.logger = logger ?? NullLogger[AudibleJobExecutor].Instance
    }

    async func ExecuteAsync(
        request JobRequest,
        @EnumeratorCancellation cancellationToken CancellationToken
    ) IAsyncEnumerable[JobUpdate] {
        ArgumentNullException.ThrowIfNull(request)
        // --no-decrypt: surface a clear error rather than silently decrypting.
        // The underlying DownloadDecryptJob doesn't currently expose a
        // download-only mode; tracked separately as a Bucket B follow-up.
        if request.NoDecrypt {
            yield JobUpdate{
                JobId: request.Id,
                Phase: JobPhase.Failed,
                Message: "--no-decrypt is not yet supported by the executor (download-only mode pending Core API support)."
            }
            yield break
        }
        // Make sure the active GUI profile is loaded so the books DB query is
        // scoped to the right account; surfaces the same "no profile" error
        // shape as auth/library commands.
        if !await CoreEnvironment.EnsureProfileLoadedAsync().ConfigureAwait(false) {
            yield JobUpdate{
                JobId: request.Id,
                Phase: JobPhase.Failed,
                Message: "No active profile. Run `oahu-cli auth login` first."
            }
            yield break
        }
        let client = clientFactory()
        let api = client.Api ??
            throw InvalidOperationException("AudibleClient.Api is null after EnsureProfileLoadedAsync returned true.")
        let book Book? = api.GetBooks()?.FirstOrDefault(
            (b Book) -> string.Equals(b.Asin, request.Asin, StringComparison.OrdinalIgnoreCase)
        )
        if book == nil {
            yield JobUpdate{
                JobId: request.Id,
                Phase: JobPhase.Failed,
                Message: "ASIN '${request.Asin}' not found in the local library. Run `oahu-cli library sync` first."
            }
            yield break
        }
        let conversion Conversion? = book.Conversion
        if conversion == nil {
            yield JobUpdate{
                JobId: request.Id,
                Phase: JobPhase.Failed,
                Message: "Book '${request.Asin}' has no Conversion record (library cache is stale)."
            }
            yield break
        }
        // Channel sized generously: progress events are cheap and the consumer
        // (the scheduler observer fan-out) drains continuously.
        let channel = Channel.CreateBounded[JobUpdate](
            BoundedChannelOptions(256){
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true,
                SingleWriter = false
            }
        )
        let translator = ProgressTranslator(request.Id, channel.Writer)
        translator.Emit(JobPhase.Licensing, message: "Requesting license")
        let progress = Progress[ProgressMessage](translator.OnProgress)
        let onState(Conversion) -> void = (c Conversion) -> translator.OnStateChanged(c)
        let settings = downloadSettingsFactory()
        // Honour per-job quality without mutating the GUI-shared settings.
        let jobSettings = PerJobDownloadSettings(settings, MapQuality(request.Quality))
        // If AAX export was requested, build a per-job IExportSettings,
        // construct the AaxExporter, and forward the convertAction to the job.
        // The translator is told whether convert is enabled so terminal phase
        // mapping accounts for the extra Exporting → Exported step.
        var convertAction ConvertDelegate[CliCancellation]? = nil
        if request.ExportToAax || request.ExportToM4b {
            let exportInner = exportSettingsFactory()
            let jobExport = PerJobExportSettings(
                exportInner,
                exportToAax: request.ExportToAax,
                exportDirectory: request.OutputDir
            )
            if string.IsNullOrEmpty(jobExport.ExportDirectory) {
                yield JobUpdate{
                    JobId: request.Id,
                    Phase: JobPhase.Failed,
                    Message: "Export requested but no export directory is configured. Pass --output-dir or set ExportSettings.ExportDirectory."
                }
                yield break
            }
            // Pre-flight the export directory so muxing failures don't surface as a
            // cryptic I/O error after a long download. We CreateDirectory (idempotent)
            // and surface a clear message on failure.
            var exportDirError string? = nil
            try {
                Directory.CreateDirectory(jobExport.ExportDirectory)
            } catch (ex Exception) {
                exportDirError = "Cannot create export directory '${jobExport.ExportDirectory}': ${ex.Message}"
            }
            if exportDirError != nil {
                yield JobUpdate{JobId: request.Id, Phase: JobPhase.Failed, Message: exportDirError}
                yield break
            }
            translator.SetConvertEnabled()
            let exporter AaxExporter? = if request.ExportToAax {
                AaxExporter(jobExport, jobSettings)
            } else {
                default(AaxExporter?)
            }
            let capturedExportDir = jobExport.ExportDirectory
            convertAction = (book Book, ctx CliCancellation, callback(Conversion) -> void) -> {
                if exporter != nil {
                    exporter.Export(book, SimpleConversionContext(nil, ctx.CancellationToken), callback)
                }
                // m4b "export" is a copy of the decrypted file to the export
                // directory: the decrypted artifact already has .m4b extension
                // (M4B-brand MP4) per Oahu.Core.Properties.Resources.
                if request.ExportToM4b {
                    try {
                        let src = book.Conversion!!.DownloadFileName + ".m4b"
                        if File.Exists(src) {
                            let dest = Path.Combine(capturedExportDir, Path.GetFileName(src))
                            File.Copy(src, dest, overwrite: true)
                        }
                    } catch (ex Exception) {
                        logger.LogWarning(ex, "m4b export copy failed for {Asin}.", request.Asin)
                    }
                }
            }
        }
        // Linked CTS so we can cancel the background task even if the consumer
        // abandons the IAsyncEnumerable without canceling cancellationToken
        // directly. We always observe runTask in the finally below.
        using let linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken)
        let linkedToken = linkedCts.Token
        // Run the actual job in the background; the foreach below pulls the
        // translated updates from the channel.
        let runTask = Task.Run(
            async () -> {
                try {
                    using let job = DownloadDecryptJob[CliCancellation](api, jobSettings, onState)
                    await job.DownloadDecryptAndConvertAsync(
                        []Conversion{conversion},
                        progress,
                        CliCancellation(linkedToken),
                        convertAction
                    )
                        .ConfigureAwait(false)
                } finally {
                    channel.Writer.TryComplete()
                }
            },
            linkedToken
        )
        var seenTerminal = false
        var runError Exception? = nil
        var canceled = false
        try {
            while await channel.Reader.WaitToReadAsync(linkedToken).ConfigureAwait(false) {
                while channel.Reader.TryRead(out var update) {
                    yield update
                    if (update.Phase is JobPhase.Completed or JobPhase.Failed or JobPhase.Canceled) {
                        seenTerminal = true
                    }
                }
            }
        } finally {
            // Always observe runTask so a thrown background exception is not "unobserved".
            // Cancelling the linked CTS first makes sure the underlying job tears down
            // promptly when the consumer abandons us before terminal phase.
            try {
                linkedCts.Cancel()
            } catch {
                // already disposed / racing — best effort

            }
            try {
                await runTask.ConfigureAwait(false)
            } catch (OperationCanceledException) {
                canceled = cancellationToken.IsCancellationRequested
            } catch (ex Exception) {
                runError = ex
                logger.LogError(ex, "Background job task threw for {Asin} ({Title}).", request.Asin, request.Title)
            }
        }
        if canceled {
            yield JobUpdate{JobId: request.Id, Phase: JobPhase.Canceled, Message: "Canceled"}
            yield break
        }
        if runError != nil {
            yield JobUpdate{JobId: request.Id, Phase: JobPhase.Failed, Message: runError.Message}
            yield break
        }
        if !seenTerminal {
            // Determine the outcome from the final Conversion state.
            let final = conversion.State
            let succeeded = if request.ExportToAax {
                final == EConversionState.Exported || final == EConversionState.Converted
            } else {
                final == EConversionState.LocalUnlocked ||
                    final == EConversionState.Exported ||
                    final == EConversionState.Converted
            }
            if succeeded {
                yield JobUpdate{JobId: request.Id, Phase: JobPhase.Completed}
            } else {
                yield JobUpdate{JobId: request.Id, Phase: JobPhase.Failed, Message: "Job ended in state '$final'."}
            }
        }
    }

    /// Translates Core's per-conversion (cref:ProgressMessage) +
    /// `OnNewStateCallback(Conversion)` firehose into the coarse-grained
    /// (cref:JobUpdate) stream the scheduler exposes. One translator
    /// per job (single ASIN), so we can safely accumulate in fields without
    /// extra synchronisation: progress callbacks are serialised on the
    /// `Progress<T>` sync context (or the thread pool when none).
    private class ProgressTranslator {
        private let jobId string
        private let writer ChannelWriter[JobUpdate]
        private let gate object = SystemObject()
        private var current JobPhase = JobPhase.Licensing
        private var downloadPermille int32
        private var decryptPercent int32
        private var convertEnabled bool
        private var licenseDenialDetailed bool

        init(jobId string, writer ChannelWriter[JobUpdate]) {
            this.jobId = jobId
            this.writer = writer
        }

        func SetConvertEnabled() -> convertEnabled = true

        func Emit(phase JobPhase, progress float64? = nil, message string? = nil) {
            lock gate {
                current = phase
                writer.TryWrite(JobUpdate{JobId: jobId, Phase: phase, Progress: progress, Message: message})
            }
        }

        func OnProgress(msg ProgressMessage) {
            lock gate {
                if msg.IncStepsPerMille is int32 dl {
                    downloadPermille = Math.Min(downloadPermille + dl, 1000)
                    if current != JobPhase.Downloading {
                        current = JobPhase.Downloading
                        writer.TryWrite(
                            JobUpdate{
                                JobId: jobId,
                                Phase: JobPhase.Downloading,
                                Progress: float64(downloadPermille) / 1000.0
                            }
                        )
                    } else {
                        writer.TryWrite(
                            JobUpdate{
                                JobId: jobId,
                                Phase: JobPhase.Downloading,
                                Progress: float64(downloadPermille) / 1000.0
                            }
                        )
                    }
                }
                if msg.IncStepsPerCent is int32 dec {
                    decryptPercent = Math.Min(decryptPercent + dec, 100)
                    if current != JobPhase.Decrypting {
                        current = JobPhase.Decrypting
                        writer.TryWrite(
                            JobUpdate{
                                JobId: jobId,
                                Phase: JobPhase.Decrypting,
                                Progress: float64(decryptPercent) / 100.0
                            }
                        )
                    } else {
                        writer.TryWrite(
                            JobUpdate{
                                JobId: jobId,
                                Phase: JobPhase.Decrypting,
                                Progress: float64(decryptPercent) / 100.0
                            }
                        )
                    }
                }
            }
        }

        func OnStateChanged(conversion Conversion?) {
            if conversion == nil {
                return
            }
            lock gate {
                switch conversion.State {
                    case EConversionState.LicenseGranted {
                        if current == JobPhase.Licensing {
                            // Licensing succeeded but not yet downloading; keep the phase but emit a heartbeat.
                            writer.TryWrite(
                                JobUpdate{JobId: jobId, Phase: JobPhase.Licensing, Message: "License granted"}
                            )
                        }
                    }
                    case EConversionState.Downloading {
                        if current != JobPhase.Downloading {
                            current = JobPhase.Downloading
                            writer.TryWrite(JobUpdate{JobId: jobId, Phase: JobPhase.Downloading, Progress: 0})
                        }
                    }
                    case EConversionState.LocalLocked {
                        if (current is JobPhase.Licensing or JobPhase.Downloading) {
                            current = JobPhase.Downloading
                            writer.TryWrite(JobUpdate{JobId: jobId, Phase: JobPhase.Downloading, Progress: 1})
                        }
                    }
                    case EConversionState.Unlocking {
                        if current != JobPhase.Decrypting {
                            current = JobPhase.Decrypting
                            writer.TryWrite(JobUpdate{JobId: jobId, Phase: JobPhase.Decrypting, Progress: 0})
                        }
                    }
                    case EConversionState.LocalUnlocked {
                        // Without convert: this is the terminal success state.
                        // With convert: just an intermediate; the exporter will move us to Converting → Exported.
                        if !convertEnabled && current != JobPhase.Completed {
                            current = JobPhase.Completed
                            writer.TryWrite(JobUpdate{JobId: jobId, Phase: JobPhase.Completed})
                        }
                    }
                    case EConversionState.Converting {
                        if current != JobPhase.Exporting {
                            current = JobPhase.Exporting
                            writer.TryWrite(JobUpdate{JobId: jobId, Phase: JobPhase.Exporting, Progress: 0})
                        }
                    }
                    case EConversionState.Exported, EConversionState.Converted {
                        if current != JobPhase.Completed {
                            current = JobPhase.Completed
                            writer.TryWrite(JobUpdate{JobId: jobId, Phase: JobPhase.Completed})
                        }
                    }
                    case EConversionState.ConversionError {
                        if current != JobPhase.Failed {
                            current = JobPhase.Failed
                            writer.TryWrite(
                                JobUpdate{JobId: jobId, Phase: JobPhase.Failed, Message: "AAX export failed"}
                            )
                        }
                    }
                    case EConversionState.LicenseDenied {
                        // A conversion reloaded from the database can still carry LicenseDenied from an
                        // earlier attempt, so this fires once before the fresh license call completes and
                        // again afterwards. Re-emit when the server's reason finally becomes available.
                        let reason = conversion.FailureReason!!
                        let haveReason = !string.IsNullOrWhiteSpace(reason)
                        if current != JobPhase.Failed || (haveReason && !licenseDenialDetailed) {
                            current = JobPhase.Failed
                            licenseDenialDetailed = haveReason
                            writer.TryWrite(
                                JobUpdate{
                                    JobId: jobId,
                                    Phase: JobPhase.Failed,
                                    Message: if haveReason {
                                        "License denied: $reason"
                                    } else {
                                        "License denied"
                                    }
                                }
                            )
                        }
                    }
                    case EConversionState.DownloadError {
                        if current != JobPhase.Failed {
                            current = JobPhase.Failed
                            writer.TryWrite(JobUpdate{JobId: jobId, Phase: JobPhase.Failed, Message: "Download failed"})
                        }
                    }
                    case EConversionState.UnlockingFailed {
                        if current != JobPhase.Failed {
                            current = JobPhase.Failed
                            writer.TryWrite(
                                JobUpdate{JobId: jobId, Phase: JobPhase.Failed, Message: "Decryption failed"}
                            )
                        }
                    }
                    default { }
                }
            }
        }
    }

    shared {
        private func MapQuality(q DownloadQuality) EDownloadQuality -> switch q {
            case DownloadQuality.Normal: EDownloadQuality.Normal
            case DownloadQuality.High: EDownloadQuality.High
            case DownloadQuality.Extreme: EDownloadQuality.Extreme
            default: EDownloadQuality.High
        }
    }
}
