package Oahu.Core.UI.Avalonia.Views

import Avalonia.Controls
import Avalonia.Interactivity
import System
import System.Diagnostics

/// Displays application metadata and project links.
partial class AboutView : UserControl {
    /// Initializes a new instance of the (cref:AboutView) class.
    init() {
        InitializeComponent()
    }

    shared {
        private let RepositoryUri Uri = Uri("https://github.com/davidobando/oahu")

        private func OpenRepositoryLink(sender object, e RoutedEventArgs) {
            Process.Start(ProcessStartInfo{FileName: RepositoryUri.AbsoluteUri, UseShellExecute: true})
        }
    }
}
