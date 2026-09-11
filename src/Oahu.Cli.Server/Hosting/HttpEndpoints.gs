package Oahu.Cli.Server.Hosting

import Microsoft.AspNetCore.Builder
import Microsoft.AspNetCore.Connections.Features
import Microsoft.AspNetCore.Http
import Microsoft.Extensions.DependencyInjection
import Oahu.Cli.App.Jobs
import Oahu.Cli.Server.Auth
import Oahu.Cli.Server.Capabilities
import Oahu.Cli.Server.Tools
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.Json
import System.Threading
import System.Threading.Tasks

/// Maps the OAhu tool surface as REST + SSE endpoints on a loopback HTTP listener.
class HttpEndpoints {
    class QueueAddBody {
        prop Asins[]?string
        prop Title string?
        prop Quality string?
        prop Profile string?
    }

    class DownloadBody {
        prop Asins[]?string
        prop Quality string?
        prop Profile string?
        prop ExportToAax bool?
        prop OutputDir string?
    }

    class ConfigSetBody {
        prop Value string?
    }

    shared {
        func Map(app WebApplication) {
            // Body-size limit middleware: protect against accidental/runaway POST bodies.
            // Tool payloads are small; cap at 256 KB.
            const maxBodyBytes = 256L * 1024L
            app.Use(
                async (ctx HttpContext, next async (HttpContext) -> void) -> {
                    if ctx.Request.ContentLength is int64 len && len > maxBodyBytes {
                        ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge
                        await ctx.Response.WriteAsync("{\"error\":\"payload_too_large\"}").ConfigureAwait(false)
                        return
                    }
                    await next(ctx).ConfigureAwait(false)
                }
            )
            // Map a few common framework exceptions to clean 4xx responses so the
            // generic dev exception page doesn't leak stack traces over the wire.
            app.Use(
                async (ctx HttpContext, next async (HttpContext) -> void) -> {
                    try {
                        await next(ctx).ConfigureAwait(false)
                    } catch (ex UnauthorizedAccessException) {
                        if !ctx.Response.HasStarted {
                            ctx.Response.StatusCode = StatusCodes.Status403Forbidden
                            await ctx
                                .Response
                                .WriteAsync(
                                "{\"error\":\"forbidden\",\"message\":${JsonSerializer.Serialize(ex.Message)}}"
                            )
                                .ConfigureAwait(false)
                        }
                    }
                }
            )
            // Strict-peer middleware: when serving on a Unix socket with --strict-peer,
            // verify that the connecting client process belongs to the same UID as the
            // server. Only enforced when both flags are set; on platforms that can't
            // resolve peer credentials we fail closed (403) rather than silently allow.
            app.Use(
                async (ctx HttpContext, next async (HttpContext) -> void) -> {
                    let opts = ctx.RequestServices.GetRequiredService[ServerOptions]()
                    if opts.StrictPeer && !string.IsNullOrEmpty(opts.UnixSocketPath) {
                        let sockFeature = ctx.Features.Get[IConnectionSocketFeature]()
                        let peerUid = if sockFeature?.Socket is {} sock {
                            PeerCredentials.TryGetPeerUid(sock)
                        } else {
                            nil
                        }
                        let ourUid = PeerCredentials.GetCurrentUid()
                        if peerUid == nil || ourUid == nil || peerUid != ourUid {
                            ctx.Response.StatusCode = StatusCodes.Status403Forbidden
                            await ctx
                                .Response
                                .WriteAsync("{\"error\":\"forbidden\",\"message\":\"peer uid mismatch\"}")
                                .ConfigureAwait(false)
                            return
                        }
                    }
                    await next(ctx).ConfigureAwait(false)
                }
            )
            // Bearer-token middleware: every request must present a matching Authorization header.
            app.Use(
                async (ctx HttpContext, next async (HttpContext) -> void) -> {
                    let token = ctx.RequestServices.GetRequiredService[TokenStore]().GetCached()
                    let auth = ctx.Request.Headers["Authorization"].ToString()
                    const prefix = "Bearer "
                    if !auth.StartsWith(prefix, StringComparison.Ordinal) || !TokenStore.Equal(
                        auth.Substring(prefix.Length),
                        token
                    ) {
                        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized
                        ctx.Response.Headers.WWWAuthenticate = "Bearer realm=\"oahu-cli\""
                        await ctx.Response.WriteAsync("{\"error\":\"unauthorized\"}").ConfigureAwait(false)
                        return
                    }
                    // Per-token rate limiter (60 req/min, burst 10). Applied after the
                    // bearer check so unauthenticated callers can't exhaust other
                    // callers' buckets, and before route handlers so SSE streams count
                    // exactly one token at connection time.
                    let limiter = ctx.RequestServices.GetRequiredService[TokenBucketRateLimiter]()
                    if !limiter.TryAcquire(token) {
                        ctx.Response.StatusCode = StatusCodes.Status429TooManyRequests
                        ctx.Response.Headers["Retry-After"] = "1"
                        await ctx.Response.WriteAsync("{\"error\":\"rate_limited\"}").ConfigureAwait(false)
                        return
                    }
                    await next(ctx).ConfigureAwait(false)
                }
            )
            let v1 = app.MapGroup("/v1")
            v1.MapGet(
                "/auth/status",
                (t OahuTools, d ToolDispatcher, ct CancellationToken) -> d.InvokeAsync(
                    "auth_status",
                    CapabilityClass.Safe,
                    nil,
                    () -> t.AuthStatusAsync(ct),
                    principal: "http"
                )
            )
            v1.MapGet(
                "/library",
                (t OahuTools, d ToolDispatcher, filter string?, limit int32?, ct CancellationToken) -> d.InvokeAsync(
                    "library_list",
                    CapabilityClass.Safe,
                    Args(("filter", filter), ("limit", limit)),
                    () -> t.LibraryListAsync(filter, limit, ct),
                    principal: "http"
                )
            )
            v1.MapGet(
                "/library/{asin}",
                (t OahuTools, d ToolDispatcher, asin string, ct CancellationToken) -> d.InvokeAsync(
                    "library_show",
                    CapabilityClass.Safe,
                    Args(("asin", asin)),
                    () -> t.LibraryShowAsync(asin, ct),
                    principal: "http"
                )
            )
            v1.MapPost(
                "/library/sync",
                (t OahuTools, d ToolDispatcher, profile string?, ct CancellationToken) -> d.InvokeAsync(
                    "library_sync",
                    CapabilityClass.Expensive,
                    Args(("profile", profile)),
                    () -> t.LibrarySyncAsync(profile, ct),
                    principal: "http"
                )
            )
            v1.MapGet(
                "/queue",
                (t OahuTools, d ToolDispatcher, ct CancellationToken) -> d.InvokeAsync(
                    "queue_list",
                    CapabilityClass.Safe,
                    nil,
                    () -> t.QueueListAsync(ct),
                    principal: "http"
                )
            )
            v1.MapPost(
                "/queue",
                async (t OahuTools, d ToolDispatcher, body QueueAddBody, ct CancellationToken) -> await d.InvokeAsync(
                    "queue_add",
                    CapabilityClass.Mutating,
                    Args(
                        ("asins", body.Asins),
                        ("title", body.Title),
                        ("quality", body.Quality),
                        ("profile", body.Profile)
                    ),
                    () -> t.QueueAddAsync(
                        body.Asins ?? Array.Empty[string](),
                        body.Title,
                        body.Quality,
                        body.Profile,
                        ct
                    ),
                    principal: "http"
                )
                    .ConfigureAwait(false)
            )
            v1.MapDelete(
                "/queue/{asin}",
                (t OahuTools, d ToolDispatcher, asin string, ct CancellationToken) -> d.InvokeAsync(
                    "queue_remove",
                    CapabilityClass.Mutating,
                    Args(("asins", []string{asin})),
                    () -> t.QueueRemoveAsync([]string{asin}, ct),
                    principal: "http"
                )
            )
            v1.MapDelete(
                "/queue",
                (t OahuTools, d ToolDispatcher, confirm bool?, ct CancellationToken) -> d.InvokeAsync(
                    "queue_clear",
                    CapabilityClass.Destructive,
                    Args(("confirm", confirm == true)),
                    () -> t.QueueClearAsync(confirm == true, ct),
                    confirmed: confirm == true,
                    principal: "http"
                )
            )
            v1.MapPost(
                "/jobs",
                async (t OahuTools, d ToolDispatcher, body DownloadBody, ct CancellationToken) -> await d.InvokeAsync(
                    "download",
                    CapabilityClass.Expensive,
                    Args(
                        ("asins", body.Asins),
                        ("quality", body.Quality),
                        ("profile", body.Profile),
                        ("exportToAax", body.ExportToAax),
                        ("outputDir", body.OutputDir)
                    ),
                    () -> t.DownloadAsync(
                        body.Asins ?? Array.Empty[string](),
                        body.Quality,
                        body.Profile,
                        body.ExportToAax ?? false,
                        body.OutputDir,
                        ct
                    ),
                    principal: "http"
                )
                    .ConfigureAwait(false)
            )
            v1.MapGet(
                "/jobs",
                (t OahuTools, d ToolDispatcher, ct CancellationToken) -> d.InvokeAsync(
                    "jobs_status",
                    CapabilityClass.Safe,
                    nil,
                    () -> t.JobsStatusAsync(nil, ct),
                    principal: "http"
                )
            )
            v1.MapGet(
                "/jobs/{jobId}",
                (t OahuTools, d ToolDispatcher, jobId string, ct CancellationToken) -> d.InvokeAsync(
                    "jobs_status",
                    CapabilityClass.Safe,
                    Args(("jobId", jobId)),
                    () -> t.JobsStatusAsync(jobId, ct),
                    principal: "http"
                )
            )
            v1.MapDelete(
                "/jobs/{jobId}",
                (t OahuTools, d ToolDispatcher, jobId string, ct CancellationToken) -> d.InvokeAsync(
                    "jobs_cancel",
                    CapabilityClass.Mutating,
                    Args(("jobId", jobId)),
                    () -> t.JobsCancelAsync(jobId, ct),
                    principal: "http"
                )
            )
            // SSE: stream JobUpdates as text/event-stream.
            v1.MapGet(
                "/jobs/stream",
                async (ctx HttpContext, jobs IJobService, ct CancellationToken) -> {
                    ctx.Response.Headers.ContentType = "text/event-stream"
                    ctx.Response.Headers.CacheControl = "no-cache"
                    ctx.Response.Headers["X-Accel-Buffering"] = "no"
                    // Subscribe BEFORE taking the snapshot so we don't lose updates that
                    // fire in the race window between snapshot and subscribe. We then
                    // emit the snapshot, then drain the stream.
                    let stream = jobs.ObserveAll(ct).GetAsyncEnumerator(ct)
                    try {
                        for snap in jobs.ListActive() {
                            await WriteSseAsync(
                                ctx,
                                "snapshot",
                                AnonymousType6_D25B56FA8EAF4772(
                                    snap.JobId,
                                    snap.Asin,
                                    snap.Title,
                                    snap.Phase.ToString(),
                                    snap.Progress,
                                    snap.Message
                                ),
                                ct
                            ).ConfigureAwait(false)
                        }
                        while await stream.MoveNextAsync().ConfigureAwait(false) {
                            let u = stream.Current
                            await WriteSseAsync(
                                ctx,
                                "update",
                                AnonymousType5_637EA6E856209F0A(
                                    u.JobId,
                                    u.Phase.ToString(),
                                    u.Progress,
                                    u.Message,
                                    u.Timestamp
                                ),
                                ct
                            ).ConfigureAwait(false)
                        }
                    } catch (OperationCanceledException) {
                        // client disconnected — normal

                    } catch (IOException) {
                        // client closed connection mid-write

                    } finally {
                        await stream.DisposeAsync().ConfigureAwait(false)
                    }
                }
            )
            v1.MapGet(
                "/history",
                (t OahuTools, d ToolDispatcher, limit int32?, ct CancellationToken) -> d.InvokeAsync(
                    "history_list",
                    CapabilityClass.Safe,
                    Args(("limit", limit)),
                    () -> t.HistoryListAsync(limit, ct),
                    principal: "http"
                )
            )
            v1.MapGet(
                "/history/{jobId}",
                (t OahuTools, d ToolDispatcher, jobId string, ct CancellationToken) -> d.InvokeAsync(
                    "history_show",
                    CapabilityClass.Safe,
                    Args(("jobId", jobId)),
                    () -> t.HistoryShowAsync(jobId, ct),
                    principal: "http"
                )
            )
            v1.MapGet(
                "/doctor",
                (t OahuTools, d ToolDispatcher, ct CancellationToken) -> d.InvokeAsync(
                    "doctor",
                    CapabilityClass.Safe,
                    nil,
                    () -> t.DoctorAsync(ct),
                    principal: "http"
                )
            )
            v1.MapGet(
                "/config",
                (t OahuTools, d ToolDispatcher, key string?, ct CancellationToken) -> d.InvokeAsync(
                    "config_get",
                    CapabilityClass.Safe,
                    Args(("key", key)),
                    () -> t.ConfigGetAsync(key, ct),
                    principal: "http"
                )
            )
            v1.MapPut(
                "/config/{key}",
                (t OahuTools, d ToolDispatcher, key string, body ConfigSetBody, ct CancellationToken) -> d.InvokeAsync(
                    "config_set",
                    CapabilityClass.Mutating,
                    Args(("key", key), ("value", body.Value)),
                    () -> t.ConfigSetAsync(key, body.Value ?? string.Empty, ct),
                    principal: "http"
                )
            )
        }

        private async func WriteSseAsync(ctx HttpContext, evt string, data object, ct CancellationToken) {
            let json = JsonSerializer.Serialize(data)
            await ctx.Response.WriteAsync((`event: ` + "$evt" + `
`), ct).ConfigureAwait(false)
            await ctx.Response.WriteAsync((`data: ` + "$json" + `

`), ct).ConfigureAwait(false)
            await ctx.Response.Body.FlushAsync(ct).ConfigureAwait(false)
        }

        private func Args(pairs ...(Key string, Value object?)) IReadOnlyDictionary[string, object?] {
            let d = Dictionary[string, object?](pairs.Length, StringComparer.Ordinal)
            for (k, v) in pairs {
                d[k] = v
            }
            return d
        }
    }
}

internal data class AnonymousType6_D25B56FA8EAF4772(
    jobId string,
    asin string,
    title string,
    phase string,
    progress float64?,
    message string?
) { }

internal data class AnonymousType5_637EA6E856209F0A(
    jobId string,
    phase string,
    progress float64?,
    message string?,
    timestamp DateTimeOffset
) { }
