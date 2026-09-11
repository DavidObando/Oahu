package Oahu.Core.UI.Avalonia.ViewModels

import Avalonia.Media.Imaging
import CommunityToolkit.Mvvm.ComponentModel
import CommunityToolkit.Mvvm.Input
import Oahu.Core
import System.Collections.ObjectModel

partial class MainWindowViewModel : ObservableObject {
    @ObservableProperty
    private var title string = "Oahu"

    @ObservableProperty
    private var isBusy bool

    @ObservableProperty
    private var statusMessage string = "Ready"

    @ObservableProperty
    private var currentView object

    @ObservableProperty
    private var isInitialized bool

    @ObservableProperty
    private var settings SettingsViewModel

    @ObservableProperty
    private var isSignedIn bool

    @ObservableProperty
    private var profileDisplayName string = "Signed out"

    @ObservableProperty
    private var profileSubtitle string = "Sign in to start the setup wizard."

    @ObservableProperty
    private var profileInitial string = "?"

    @ObservableProperty
    private var profileImage Bitmap?

    @ObservableProperty
    private var hasProfileImage bool

    init() {
        BookLibrary = BookLibraryViewModel()
        Conversion = ConversionViewModel()
    }

    prop BookLibrary BookLibraryViewModel {
        get;
        init;
    }

    prop Conversion ConversionViewModel {
        get;
        init;
    }

    prop AudibleClient AudibleClient
    prop CurrentProfile IProfileAliasKey?
    prop Api IAudibleApi?

    func SetBusy(busy bool, message string? = nil) {
        IsBusy = busy
        if message != nil {
            StatusMessage = message
        }
    }

    func InitSettings(downloadSettings DownloadSettings, exportSettings ExportSettings, configSettings ConfigSettings) {
        Settings = SettingsViewModel(downloadSettings, exportSettings, configSettings)
        BookLibrary.SetDownloadSettings(downloadSettings)
    }

    func SetSignedInProfile(displayName string, givenName string, subtitle string, profileImage Bitmap? = nil) {
        ProfileDisplayName = if string.IsNullOrWhiteSpace(displayName) {
            "Audible account"
        } else {
            displayName
        }
        ProfileSubtitle = if string.IsNullOrWhiteSpace(subtitle) {
            "Audible account"
        } else {
            subtitle
        }
        ProfileInitial = CreateProfileInitial(givenName, ProfileDisplayName)
        ProfileImage = profileImage
        IsSignedIn = true
    }

    func ClearSignedInProfile() {
        CurrentProfile = nil
        Api = nil
        ProfileDisplayName = "Signed out"
        ProfileSubtitle = "Sign in to start the setup wizard."
        ProfileInitial = "?"
        ProfileImage = nil
        IsSignedIn = false
    }

    private func OnProfileImageChanged(value Bitmap?) {
        HasProfileImage = value != nil
    }

    shared {
        private func CreateProfileInitial(givenName string, displayName string) string {
            let source = if !string.IsNullOrWhiteSpace(givenName) {
                givenName
            } else {
                displayName
            }
            if string.IsNullOrWhiteSpace(source) {
                return "?"
            }
            return char.ToUpperInvariant(source.Trim()[0]).ToString()
        }
    }
}
