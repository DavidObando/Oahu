package Oahu.Core.UI.Avalonia.ViewModels

import CommunityToolkit.Mvvm.ComponentModel
import System

partial class AboutViewModel : ObservableObject {
    prop AppName string -> "Oahu"
    prop Version string -> ThisAssembly.AssemblyFileVersion
    prop Copyright string -> "© ${DateTime.UtcNow.Year} DavidObando"
    prop Description string -> "Audible audiobook library manager and converter"
}
