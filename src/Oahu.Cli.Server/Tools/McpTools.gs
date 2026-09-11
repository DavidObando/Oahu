package Oahu.Cli.Server.Tools

import ModelContextProtocol.Server
import Oahu.Cli.Server.Capabilities
import Oahu.Cli.Server.Hosting
import System
import System.Collections.Generic
import System.ComponentModel
import System.Threading
import System.Threading.Tasks

/// MCP-stdio tool surface. Each method is a thin wrapper around (cref:OahuTools)
/// that runs the call through (cref:ToolDispatcher) for capability gating + audit.
///
/// Capability classes are owned by the corresponding method on (cref:OahuTools)
/// (via (cref:OahuCapabilityAttribute)) — duplication here is mechanical and
/// intentional: the wrapper exists only so the MCP SDK can discover it via attributes.
@McpServerToolType
class McpTools {
    @McpServerTool(Name: "auth_status")
    @Description("Show every signed-in Audible profile and the active one.")
    func AuthStatus(tools OahuTools, d ToolDispatcher, ct CancellationToken) Task[object] -> d.InvokeAsync(
        "auth_status",
        CapabilityClass.Safe,
        nil,
        () -> tools.AuthStatusAsync(ct)
    )

    @McpServerTool(Name: "library_list")
    @Description(
        "List books in the local library cache. `filter` matches title/author/series substring; `limit` caps results."
    )
    func LibraryList(
        tools OahuTools,
        d ToolDispatcher,
        filter string? = nil,
        limit int32? = nil,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d
        .InvokeAsync(
        "library_list",
        CapabilityClass.Safe,
        Args(("filter", filter), ("limit", limit)),
        () -> tools.LibraryListAsync(filter, limit, ct)
    )

    @McpServerTool(Name: "library_show")
    @Description("Show full library detail for a single ASIN.")
    func LibraryShow(
        tools OahuTools,
        d ToolDispatcher,
        asin string,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d.InvokeAsync(
        "library_show",
        CapabilityClass.Safe,
        Args(("asin", asin)),
        () -> tools.LibraryShowAsync(asin, ct)
    )

    @McpServerTool(Name: "library_sync")
    @Description("Pull the latest library snapshot from Audible. Long-running; counts as 'expensive'.")
    func LibrarySync(
        tools OahuTools,
        d ToolDispatcher,
        profile string? = nil,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d.InvokeAsync(
        "library_sync",
        CapabilityClass.Expensive,
        Args(("profile", profile)),
        () -> tools.LibrarySyncAsync(profile, ct)
    )

    @McpServerTool(Name: "queue_list")
    @Description("List pending download queue entries.")
    func QueueList(tools OahuTools, d ToolDispatcher, ct CancellationToken) Task[object] -> d.InvokeAsync(
        "queue_list",
        CapabilityClass.Safe,
        nil,
        () -> tools.QueueListAsync(ct)
    )

    @McpServerTool(Name: "queue_add")
    @Description(
        "Add one or more ASINs to the queue. `quality` is High|Normal|Low. `title` is honoured only when adding a single ASIN."
    )
    func QueueAdd(
        tools OahuTools,
        d ToolDispatcher,
        asins[]string,
        title string? = nil,
        quality string? = nil,
        profile string? = nil,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d
        .InvokeAsync(
        "queue_add",
        CapabilityClass.Mutating,
        Args(("asins", asins), ("title", title), ("quality", quality), ("profile", profile)),
        () -> tools.QueueAddAsync(asins, title, quality, profile, ct)
    )

    @McpServerTool(Name: "queue_remove")
    @Description("Remove one or more ASINs from the queue.")
    func QueueRemove(
        tools OahuTools,
        d ToolDispatcher,
        asins[]string,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d.InvokeAsync(
        "queue_remove",
        CapabilityClass.Mutating,
        Args(("asins", asins)),
        () -> tools.QueueRemoveAsync(asins, ct)
    )

    @McpServerTool(Name: "queue_clear")
    @Description("Remove every entry from the queue. Destructive — pass `confirm: true` to authorise.")
    func QueueClear(
        tools OahuTools,
        d ToolDispatcher,
        confirm bool = false,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d
        .InvokeAsync(
        "queue_clear",
        CapabilityClass.Destructive,
        Args(("confirm", confirm)),
        () -> tools.QueueClearAsync(confirm, ct),
        confirmed: confirm
    )

    @McpServerTool(Name: "download")
    @Description(
        "Submit a download for one or more ASINs. Returns immediately with the assigned jobIds; poll `jobs_status` to track progress."
    )
    func Download(
        tools OahuTools,
        d ToolDispatcher,
        asins[]string,
        quality string? = nil,
        profile string? = nil,
        exportToAax bool = false,
        outputDir string? = nil,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d
        .InvokeAsync(
        "download",
        CapabilityClass.Expensive,
        Args(
            ("asins", asins),
            ("quality", quality),
            ("profile", profile),
            ("exportToAax", exportToAax),
            ("outputDir", outputDir)
        ),
        () -> tools.DownloadAsync(asins, quality, profile, exportToAax, outputDir, ct)
    )

    @McpServerTool(Name: "jobs_status")
    @Description("Latest-known status of one job (`jobId`) or every active job (omit `jobId`).")
    func JobsStatus(
        tools OahuTools,
        d ToolDispatcher,
        jobId string? = nil,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d.InvokeAsync(
        "jobs_status",
        CapabilityClass.Safe,
        Args(("jobId", jobId)),
        () -> tools.JobsStatusAsync(jobId, ct)
    )

    @McpServerTool(Name: "jobs_cancel")
    @Description("Cooperatively cancel a running or queued job. Returns `{canceled: true}` if the job was found.")
    func JobsCancel(
        tools OahuTools,
        d ToolDispatcher,
        jobId string,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d.InvokeAsync(
        "jobs_cancel",
        CapabilityClass.Mutating,
        Args(("jobId", jobId)),
        () -> tools.JobsCancelAsync(jobId, ct)
    )

    @McpServerTool(Name: "history_list")
    @Description("List terminal job records (success/failure/cancel). `limit` returns the most-recent N.")
    func HistoryList(
        tools OahuTools,
        d ToolDispatcher,
        limit int32? = nil,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d.InvokeAsync(
        "history_list",
        CapabilityClass.Safe,
        Args(("limit", limit)),
        () -> tools.HistoryListAsync(limit, ct)
    )

    @McpServerTool(Name: "history_show")
    @Description("Show one history record by jobId.")
    func HistoryShow(
        tools OahuTools,
        d ToolDispatcher,
        jobId string,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d.InvokeAsync(
        "history_show",
        CapabilityClass.Safe,
        Args(("jobId", jobId)),
        () -> tools.HistoryShowAsync(jobId, ct)
    )

    @McpServerTool(Name: "doctor")
    @Description(
        "Run environment self-checks (write perms, profile store readable, library cache reachable, Audible API reachable, disk free)."
    )
    func Doctor(tools OahuTools, d ToolDispatcher, ct CancellationToken) Task[object] -> d.InvokeAsync(
        "doctor",
        CapabilityClass.Safe,
        nil,
        () -> tools.DoctorAsync(ct)
    )

    @McpServerTool(Name: "config_get")
    @Description("Get one config key (or every key when `key` is omitted).")
    func ConfigGet(
        tools OahuTools,
        d ToolDispatcher,
        key string? = nil,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d.InvokeAsync(
        "config_get",
        CapabilityClass.Safe,
        Args(("key", key)),
        () -> tools.ConfigGetAsync(key, ct)
    )

    @McpServerTool(Name: "config_set")
    @Description(
        "Set one config key. Allowed keys: DownloadDirectory, DefaultQuality, MaxParallelJobs, KeepEncryptedFiles."
    )
    func ConfigSet(
        tools OahuTools,
        d ToolDispatcher,
        key string,
        value string,
        ct CancellationToken = default(CancellationToken)
    ) Task[object] -> d
        .InvokeAsync(
        "config_set",
        CapabilityClass.Mutating,
        Args(("key", key), ("value", value)),
        () -> tools.ConfigSetAsync(key, value, ct)
    )

    shared {
        private func Args(pairs ...(Key string, Value object?)) IReadOnlyDictionary[string, object?] {
            let d = Dictionary[string, object?](pairs.Length, StringComparer.Ordinal)
            for (k, v) in pairs {
                d[k] = v
            }
            return d
        }
    }
}
