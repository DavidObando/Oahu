package Oahu.App.Avalonia

import Avalonia.Controls
import Oahu.Core.UI.Avalonia.ViewModels
import System
import System.Threading.Tasks

partial class SetupWizardWindow : Window {
    private let viewModel ProfileWizardViewModel

    init() {
        InitializeComponent()
    }

    convenience init(viewModel ProfileWizardViewModel) {
        init()
        this.viewModel = viewModel
        DataContext = viewModel
        viewModel.WizardCompleted += (s object?, e EventArgs) -> Close(viewModel.RegistrationSucceeded)
    }

    /// Shows the setup wizard as a modal dialog. Returns true if a profile was created.
    async func ShowWizardAsync(owner Window) bool {
        let result = await ShowDialog[bool?](owner)
        return result == true
    }
}
