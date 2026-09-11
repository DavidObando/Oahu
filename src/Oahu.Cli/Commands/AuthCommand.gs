package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Models
import Oahu.Cli.Output
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.Linq
import System.Text
import System.Threading
import System.Threading.Tasks

/// `oahu-cli auth login | status | logout`.
///
/// 4b.1 ships the command surface against (cref:IAuthService). The default
/// resolver in (cref:CliServiceFactory) returns a Fake, so on a clean
/// machine `auth status` reports "no profiles signed in" until 4b.2 wires the
/// Core-backed `CoreAuthService`. `auth login` runs the broker
/// round-trip (URL prompt → user pastes redirect URL) end-to-end against the fake;
/// 4b.2 routes the same flow into `AudibleClient.ConfigParseExternalLoginResponseAsync`.
///
/// Exit codes (per design §10): `0` success, `3` auth required/failed,
/// `2` usage error (caught earlier by (cref:ParseErrorRewriter)).
class AuthCommand {
    shared {
        const SchemaResource string = "auth-status"
        private let RegionTokens[]string = []string{"us", "uk", "de", "fr", "jp", "it", "au", "in", "ca", "es", "br"}

        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let cmd = Command("auth", "Sign in / out of Audible and inspect the active profile.")
            cmd.Subcommands.Add(CreateLogin(resolveGlobals))
            cmd.Subcommands.Add(CreateStatus(resolveGlobals))
            cmd.Subcommands.Add(CreateLogout(resolveGlobals))
            return cmd
        }

        func ToDictionary(session AuthSession) IReadOnlyDictionary[string, object?] -> Dictionary[string, object?]{
            ["profileAlias"] = session.ProfileAlias,
            ["region"] = session.Region.ToString().ToLowerInvariant(),
            ["accountId"] = session.AccountId,
            ["accountName"] = session.AccountName,
            ["deviceName"] = session.DeviceName,
            ["expiresAt"] = session.ExpiresAt,
            ["isExpired"] = session.IsExpired
        }

        private func CreateLogin(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let regionArg = Argument[string]("region"){
                Arity = ArgumentArity.ZeroOrOne,
                Description = "Audible marketplace: us|uk|de|fr|jp|it|au|in|ca|es|br.",
                DefaultValueFactory = (_ ArgumentResult) -> "us"
            }
            regionArg.AcceptOnlyFromAmong(RegionTokens)
            let regionOpt = Option[string?]("--region"){
                Description = "Audible marketplace (alternative to the positional argument)."
            }
            regionOpt.AcceptOnlyFromAmong(RegionTokens)
            let preAmazonOpt = Option[bool]("--pre-amazon"){
                Description = "Use the legacy pre-Amazon Audible username flow (rare)."
            }
            let usernameOpt = Option[string?]("--username", "-u"){
                Description = "Audible / Amazon account email. Prompted interactively when omitted."
            }
            let passwordStdinOpt = Option[bool]("--password-stdin"){
                Description = "Read the account password from the first line of stdin (for non-interactive use)."
            }
            let browserOpt = Option[bool]("--browser"){
                Description = "Use the legacy browser-redirect sign-in flow instead of credentials."
            }
            let noSyncOpt = Option[bool]("--no-sync"){Description = "Skip the post-sign-in library sync."}
            let c = Command("login", "Sign in to an Audible marketplace."){
                regionArg,
                regionOpt,
                preAmazonOpt,
                usernameOpt,
                passwordStdinOpt,
                browserOpt,
                noSyncOpt
            }
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    let regionToken = parse.GetValue(regionOpt) ?? parse.GetValue(regionArg) ?? "us"
                    let region = ParseRegion(regionToken)
                    let preAmazon = parse.GetValue(preAmazonOpt)
                    let browser = parse.GetValue(browserOpt)
                    let noSync = parse.GetValue(noSyncOpt)
                    let broker IAuthCallbackBroker = if CliEnvironment.IsStdinTty {
                        cast[IAuthCallbackBroker](
                            StdinCallbackBroker(Console.In, CliEnvironment.Error, interactive: true)
                        )
                    } else {
                        cast[IAuthCallbackBroker](NonInteractiveCallbackBroker())
                    }
                    try {
                        let svc = CliServiceFactory.AuthServiceFactory()
                        var session AuthSession
                        if browser {
                            // Legacy browser-based sign-in: build login URI, user pastes
                            // the redirect URL via the broker.
                            session = await svc.LoginAsync(region, broker, preAmazon, ct).ConfigureAwait(false)
                        } else {
                            // Default: programmatic (username + password) sign-in to
                            // mirror the TUI/GUI flow. Any CAPTCHA/MFA/CVF/approval
                            // challenges are routed through the broker.
                            let credentials = ResolveCredentials(parse, usernameOpt, passwordStdinOpt)
                            session = await svc.LoginWithCredentialsAsync(region, broker, credentials, preAmazon, ct)
                                .ConfigureAwait(false)
                        }
                        var libraryCount int32? = nil
                        var syncWarning string? = nil
                        if !noSync {
                            try {
                                let library = CliServiceFactory.LibraryServiceFactory()
                                libraryCount = await library.SyncAsync(session.ProfileAlias, ct).ConfigureAwait(false)
                            } catch (OperationCanceledException) {
                                rethrow
                            } catch (ex Exception) {
                                // Sign-in itself succeeded — credentials are stored on
                                // disk via CoreAuthService.CompleteRegistrationAsync.
                                // Report the sync failure but don't fail the command:
                                // the user can re-run `oahu-cli library sync` later.
                                syncWarning = ex.Message
                                CliEnvironment.Error.WriteLine(
                                    "Sign-in succeeded but library sync failed: ${ex.Message}"
                                )
                                CliEnvironment.Error.WriteLine("Run `oahu-cli library sync` to retry.")
                            }
                        }
                        let dict = Dictionary[string, object?](ToDictionary(session)){
                            ["librarySynced"] = !noSync && syncWarning == nil
                        }
                        if libraryCount is int32 count {
                            dict["libraryCount"] = count
                        }
                        if syncWarning != nil {
                            dict["syncError"] = syncWarning
                        }
                        writer.WriteResource("auth-login-result", dict)
                        return ExitCodes.Success
                    } catch (ex NonInteractiveCallbackException) {
                        CliEnvironment.Error.WriteLine("Sign-in needs '${ex.Kind}' input but stdin is not a TTY.")
                        CliEnvironment.Error.WriteLine(
                            "Re-run from an interactive terminal, supply --username and --password-stdin, " +
                                "or sign in via the Oahu TUI/GUI."
                        )
                        return ExitCodes.AuthError
                    } catch (ex Exception) {
                        CliEnvironment.Error.WriteLine("Sign-in failed: ${ex.Message}")
                        return ExitCodes.AuthError
                    }
                }
            )
            return c
        }

        private func ResolveCredentials(
            parse ParseResult,
            usernameOpt Option[string?],
            passwordStdinOpt Option[bool]
        ) AuthCredentials {
            var username = parse.GetValue(usernameOpt)
            let passwordFromStdin = parse.GetValue(passwordStdinOpt)
            if string.IsNullOrWhiteSpace(username) {
                if !CliEnvironment.IsStdinTty {
                    throw NonInteractiveCallbackException("username")
                }
                CliEnvironment.Error.Write("Audible / Amazon email: ")
                username = Console.In.ReadLine()?.Trim()
                if string.IsNullOrWhiteSpace(username) {
                    throw InvalidOperationException("Email is required.")
                }
            }
            var password string
            if passwordFromStdin {
                // Read exactly one line; works for `echo $PW | oahu-cli auth login --password-stdin`.
                password = Console.In.ReadLine() ?? string.Empty
            } else if CliEnvironment.IsStdinTty {
                CliEnvironment.Error.Write("Password: ")
                password = ReadMaskedPassword()
                CliEnvironment.Error.WriteLine()
            } else {
                throw NonInteractiveCallbackException("password")
            }
            if string.IsNullOrEmpty(password) {
                throw InvalidOperationException("Password is required.")
            }
            return AuthCredentials(username, password)
        }

        private func ReadMaskedPassword() string {
            let sb = StringBuilder()
            while true {
                var key ConsoleKeyInfo
                try {
                    key = Console.ReadKey(intercept: true)
                } catch (InvalidOperationException) {
                    // Stdin redirected after IsStdinTty check; fall back to ReadLine.
                    return Console.In.ReadLine() ?? string.Empty
                }
                if key.Key == ConsoleKey.Enter {
                    return sb.ToString()
                }
                if key.Key == ConsoleKey.Backspace {
                    if sb.Length > 0 {
                        sb.Length--
                    }
                    continue
                }
                if key.KeyChar != '\u0000' && !char.IsControl(key.KeyChar) {
                    sb.Append(key.KeyChar)
                }
            }
        }

        private func CreateStatus(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let c = Command("status", "List signed-in profiles.")
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    let svc = CliServiceFactory.AuthServiceFactory()
                    let sessions = await svc.ListSessionsAsync(ct).ConfigureAwait(false)
                    let active AuthSession? = await svc.GetActiveAsync(ct).ConfigureAwait(false)
                    let rows = List[IReadOnlyDictionary[string, object?]](sessions.Count)
                    for s in sessions {
                        let d = Dictionary[string, object?](ToDictionary(s)){
                            ["isActive"] = active != nil && string.Equals(
                                active.ProfileAlias,
                                s.ProfileAlias,
                                StringComparison.Ordinal
                            )
                        }
                        rows.Add(d)
                    }
                    writer.WriteCollection(
                        SchemaResource,
                        rows,
                        []OutputColumn{
                            OutputColumn("profileAlias", "Alias"),
                            OutputColumn("region", "Region"),
                            OutputColumn("accountName", "Account"),
                            OutputColumn("deviceName", "Device"),
                            OutputColumn("isExpired", "Expired"),
                            OutputColumn("isActive", "Active")
                        }
                    )
                    return if sessions.Count == 0 {
                        ExitCodes.AuthError
                    } else {
                        ExitCodes.Success
                    }
                }
            )
            return c
        }

        private func CreateLogout(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let profileOpt = Option[string?]("--profile"){
                Description = "Profile alias to sign out (defaults to the active profile)."
            }
            let c = Command("logout", "Remove a signed-in profile."){profileOpt}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    let svc = CliServiceFactory.AuthServiceFactory()
                    var alias = parse.GetValue(profileOpt)
                    if string.IsNullOrWhiteSpace(alias) {
                        let active AuthSession? = await svc.GetActiveAsync(ct).ConfigureAwait(false)
                        if active == nil {
                            CliEnvironment.Error.WriteLine("No active profile. Pass --profile <alias>.")
                            return ExitCodes.AuthError
                        }
                        alias = active.ProfileAlias
                    }
                    if globals.DryRun {
                        writer.WriteResource("auth-logout-plan", Dictionary[string, object?]{["wouldLogout"] = alias})
                        return ExitCodes.Success
                    }
                    try {
                        await svc.LogoutAsync(alias, ct).ConfigureAwait(false)
                        writer.WriteSuccess("Signed out of '$alias'.")
                        return ExitCodes.Success
                    } catch (ex Exception) {
                        CliEnvironment.Error.WriteLine("Sign-out failed: ${ex.Message}")
                        return ExitCodes.GenericFailure
                    }
                }
            )
            return c
        }

        private func ParseRegion(token string) CliRegion -> switch token.ToLowerInvariant() {
            case "us": CliRegion.Us
            case "uk": CliRegion.Uk
            case "de": CliRegion.De
            case "fr": CliRegion.Fr
            case "jp": CliRegion.Jp
            case "it": CliRegion.It
            case "au": CliRegion.Au
            case "in": CliRegion.In
            case "ca": CliRegion.Ca
            case "es": CliRegion.Es
            case "br": CliRegion.Br
            default: throw ArgumentException("Unknown region '$token'.")
        }
    }
}
