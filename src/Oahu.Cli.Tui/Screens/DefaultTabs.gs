package Oahu.Cli.Tui.Screens

import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Queue
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic

/// The six default tabs.
class DefaultTabs {
    shared {
        /// Create placeholder tabs (Phase 6 fallback).
        func Create() IReadOnlyList[ITabScreen] -> []ITabScreen{
            PlaceholderScreen{
                Title: "Home",
                NumberKey: '1',
                Heading: "Aloha.",
                Body: "Quick actions, recent events, and a status summary live here."
            },
            PlaceholderScreen{
                Title: "Library",
                NumberKey: '2',
                Heading: "Library",
                Body: "Searchable table of your Audible library with multi-select."
            },
            PlaceholderScreen{
                Title: "Queue",
                NumberKey: '3',
                Heading: "Queue",
                Body: "Ordered list of jobs waiting to run; reorder, remove, start."
            },
            PlaceholderScreen{
                Title: "Jobs",
                NumberKey: '4',
                Heading: "Jobs",
                Body: "Live in-flight jobs, with download / decrypt / mux / export progress."
            },
            PlaceholderScreen{
                Title: "History",
                NumberKey: '5',
                Heading: "History",
                Body: "Completed and failed jobs; re-run, view error, open file."
            },
            PlaceholderScreen{
                Title: "Settings",
                NumberKey: '6',
                Heading: "Settings",
                Body: "Edit configuration, switch theme, manage profiles."
            }
        }

        /// Create real tabs with services wired in. Phase 8: Queue, Jobs, History
        /// are now real screens backed by (cref:IQueueService) and
        /// (cref:IJobService).
        func CreateReal(
            state AppShellState,
            authServiceFactory() -> IAuthService,
            libraryServiceFactory() -> ILibraryService,
            configServiceFactory() -> IConfigService,
            queueServiceFactory() -> IQueueService,
            jobServiceFactory() -> IJobService
        ) IReadOnlyList[ITabScreen] {
            return []ITabScreen{
                HomeScreen(state, authServiceFactory, libraryServiceFactory),
                LibraryScreen(state, libraryServiceFactory, queueServiceFactory),
                QueueScreen(queueServiceFactory, jobServiceFactory),
                JobsScreen(jobServiceFactory),
                HistoryScreen(jobServiceFactory),
                SettingsScreen(configServiceFactory)
            }
        }
    }
}

/// Placeholder screens for tabs not yet implemented.
internal class PlaceholderScreen : ITabScreen {
    init() {
        Hints = Array.Empty[KeyValuePair[string, string?]]()
    }

    prop Title string {
        get;
        init;
    }

    prop NumberKey char {
        get;
        init;
    }

    prop Heading string {
        get;
        init;
    }

    prop Body string {
        get;
        init;
    }

    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get;
        init;
    }

    func Render(width int32, height int32) IRenderable {
        let rows = List[IRenderable]{
            Markup("[${Tokens.TextPrimary.Value.ToMarkup()} bold]${Markup.Escape(Heading)}[/]"),
            Markup(string.Empty),
            Markup("[${Tokens.TextSecondary.Value.ToMarkup()}]${Markup.Escape(Body)}[/]"),
            Markup(string.Empty),
            Markup("[${Tokens.TextTertiary.Value.ToMarkup()}](real content lands in a later phase)[/]")
        }
        return Padder(Rows(rows)).Padding(2, 1, 2, 1)
    }

    func HandleKey(key ConsoleKeyInfo) bool -> false
}
