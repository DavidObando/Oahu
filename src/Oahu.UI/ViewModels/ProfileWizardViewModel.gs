package Oahu.Core.UI.Avalonia.ViewModels

import Avalonia.Media.Imaging
import Avalonia.Threading
import CommunityToolkit.Mvvm.ComponentModel
import CommunityToolkit.Mvvm.Input
import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.Aux.Logging
import Oahu.CommonTypes
import Oahu.Core
import Oahu.Core.UI.Avalonia.Converters
import System
import System.Collections.Generic
import System.Collections.ObjectModel
import System.IO
import System.Linq
import System.Threading.Tasks

partial class ProfileWizardViewModel : ObservableObject {
    private var client AudibleClient?
    private var downloadSettings DownloadSettings?
    private var exportSettings ExportSettings?

    @ObservableProperty
    private var currentStep int32

    @ObservableProperty
    private var totalSteps int32 = 6

    @ObservableProperty
    private var stepTitle string

    @ObservableProperty
    private var canGoNext bool

    @ObservableProperty
    private var canGoBack bool

    @ObservableProperty
    private var isComplete bool

    // Step 0: Marketplace selection
    @ObservableProperty
    private var selectedRegion ERegion = ERegion.Us

    @ObservableProperty
    private var usePreAmazonAccount bool

    @ObservableProperty
    private var preAmazonAllowed bool

    // Step 1: Login
    @ObservableProperty
    private var loginUrl string

    @ObservableProperty
    private var isLoggingIn bool

    @ObservableProperty
    private var loginUrlCopied bool

    @ObservableProperty
    private var pastedResponseUrl string?

    @ObservableProperty
    private var isProcessingResponse bool

    @ObservableProperty
    private var loginErrorMessage string?

    // Step 1: Direct login
    @ObservableProperty
    private var useDirectLogin bool = true

    @ObservableProperty
    private var emailInput string

    @ObservableProperty
    private var passwordInput string

    // Step 1: Challenge handling (CAPTCHA, MFA, CVF, approval)
    @ObservableProperty
    private var showChallenge bool

    @ObservableProperty
    private var challengeMessage string

    @ObservableProperty
    private var challengeHasImage bool

    @ObservableProperty
    private var challengeImage Bitmap?

    @ObservableProperty
    private var challengeHasInput bool

    @ObservableProperty
    private var challengeInput string?

    @ObservableProperty
    private var challengeInputWatermark string?

    @ObservableProperty
    private var challengeSubmitText string = "Submit"

    private var challengeTcs TaskCompletionSource[string]?

    // Step 2: Account alias
    @ObservableProperty
    private var accountAlias string

    @ObservableProperty
    private var customerName string

    // Step 3: Download directory
    @ObservableProperty
    private var downloadDirectory string

    // Step 4: Export to AAX
    @ObservableProperty
    private var exportToAax bool

    @ObservableProperty
    private var exportDirectory string

    // Step 5: Completion
    @ObservableProperty
    private var completionMessage string

    @ObservableProperty
    private var registrationSucceeded bool

    init() {
        AvailableRegions = Enum.GetValues[ERegion]().ToList().AsReadOnly()
        CurrentStep = 0
        UpdateStepState()
    }

    /// Event raised when the wizard completes (success or skip).
    event WizardCompleted EventHandler

    /// Event raised when the user wants to browse for a download directory.
    /// The view code-behind handles the folder picker and sets the result.
    event BrowseDownloadDirectoryRequested Func[Task[string]]

    /// Event raised when the user wants to browse for an export directory.
    /// The view code-behind handles the folder picker and sets the result.
    event BrowseExportDirectoryRequested Func[Task[string]]

    prop AvailableRegions IReadOnlyList[ERegion] {
        get;
        init;
    }

    /// The resulting profile key after successful registration.
    /// Set by the wizard upon completion.
    prop ProfileKey IProfileKeyEx? {
        get;
        private set;
    }

    func SetClient(client AudibleClient) {
        this.client = client
    }

    func SetSettings(downloadSettings DownloadSettings?, exportSettings ExportSettings?) {
        this.downloadSettings = downloadSettings
        this.exportSettings = exportSettings
        let musicDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Music", "Oahu")
        DownloadDirectory = downloadSettings?.DownloadDirectory ?? Path.Combine(musicDir, "Downloads")
        ExportToAax = exportSettings?.ExportToAax ?? false
        ExportDirectory = exportSettings?.ExportDirectory ?? Path.Combine(musicDir, "Exports")
    }

    private func OnSelectedRegionChanged(value ERegion) {
        PreAmazonAllowed = value == ERegion.De || value == ERegion.Uk || value == ERegion.Us
        if !PreAmazonAllowed {
            UsePreAmazonAccount = false
        }
    }

    @RelayCommand
    private func Next() {
        if CurrentStep < TotalSteps - 1 {
            // Apply settings before advancing
            ApplyCurrentStepSettings()
            CurrentStep++
            UpdateStepState()
            if CurrentStep == 1 {
                BuildLoginUrl()
            }
            if CurrentStep == 5 {
                ApplyAllSettings()
            }
        }
    }

    @RelayCommand
    private func Back() {
        if CurrentStep > 0 {
            CurrentStep--
            UpdateStepState()
        }
    }

    @RelayCommand
    private func Skip() {
        ApplyAllSettings()
        IsComplete = true
        WizardCompleted?(this, EventArgs.Empty)
    }

    @RelayCommand
    private func Finish() {
        ApplyAllSettings()
        IsComplete = true
        WizardCompleted?(this, EventArgs.Empty)
    }

    @RelayCommand
    private func OpenLoginInBrowser() {
        if !LoginUrl.IsNullOrWhiteSpace() {
            ShellExecute.File(LoginUrl)
            LoginUrlCopied = true
            IsLoggingIn = true
        }
    }

    @RelayCommand
    private func CopyLoginUrl() {
        // Clipboard access will be handled by the view code-behind
        LoginUrlCopied = true
        IsLoggingIn = true
    }

    @RelayCommand
    private async func BrowseDownloadDirectory() {
        if BrowseDownloadDirectoryRequested != nil {
            let path = await BrowseDownloadDirectoryRequested()
            if !path.IsNullOrWhiteSpace() {
                DownloadDirectory = path
            }
        }
    }

    @RelayCommand
    private async func BrowseExportDirectory() {
        if BrowseExportDirectoryRequested != nil {
            let path = await BrowseExportDirectoryRequested()
            if !path.IsNullOrWhiteSpace() {
                ExportDirectory = path
            }
        }
    }

    @RelayCommand
    private async func SubmitResponseUrl() {
        if PastedResponseUrl.IsNullOrWhiteSpace() {
            return
        }
        let succ = Uri.TryCreate(PastedResponseUrl, UriKind.Absolute, out var uri)
        if !succ {
            LoginErrorMessage = "Invalid URL. Please paste the full URL from your browser's address bar."
            return
        }
        LoginErrorMessage = nil
        IsProcessingResponse = true
        try {
            let callbacks = Callbacks{
                DeregisterDeviceConfirmCallback: DeregisterDeviceConfirmation,
                GetAccountAliasFunc: GetAccountAliasFromWizard
            }
            let result = await client!!.ConfigParseExternalLoginResponseAsync(uri, callbacks)
            Log(3, this, () -> "result=${result.Result}")
            let key IProfileKeyEx? = result.NewProfileKey
            switch result.Result {
                case EAuthorizeResult.Succ, EAuthorizeResult.DeregistrationFailed {
                    ProfileKey = key
                    CustomerName = (key?.AccountName)!!
                    AccountAlias = (key?.AccountName)!!
                    RegistrationSucceeded = true
                    // Advance to account alias step
                    CurrentStep = 2
                    UpdateStepState()
                    if result.Result == EAuthorizeResult.DeregistrationFailed {
                        LoginErrorMessage = "Note: A previous device \"${result.PrevDeviceName}\" could not be deregistered."
                    }
                }
                case EAuthorizeResult.AuthorizationFailed {
                    LoginErrorMessage = "Authorization failed. The sign-in URL may have expired. Please go back and try again."
                }
                case EAuthorizeResult.RegistrationFailed {
                    LoginErrorMessage = "Device registration failed. Please try again."
                }
                default {
                    LoginErrorMessage = "An error occurred: ${result.Result}"
                }
            }
        } catch (ex Exception) {
            Log(1, this, () -> "error: ${ex.Message}")
            LoginErrorMessage = "An error occurred: ${ex.Message}"
        } finally {
            IsProcessingResponse = false
        }
    }

    @RelayCommand
    private async func SubmitDirectLogin() {
        if EmailInput.IsNullOrWhiteSpace() || PasswordInput.IsNullOrWhiteSpace() {
            LoginErrorMessage = "Please enter both email and password."
            return
        }
        LoginErrorMessage = nil
        IsProcessingResponse = true
        ShowChallenge = false
        try {
            let credentials = Credentials(EmailInput, PasswordInput)
            let callbacks = Callbacks{
                DeregisterDeviceConfirmCallback: DeregisterDeviceConfirmation,
                GetAccountAliasFunc: GetAccountAliasFromWizard,
                CaptchaCallback: HandleCaptchaCallback,
                MfaCallback: HandleMfaCallback,
                CvfCallback: HandleCvfCallback,
                ApprovalCallback: HandleApprovalCallback
            }
            let result = await client!!.ConfigFromProgrammaticLoginAsync(
                SelectedRegion,
                UsePreAmazonAccount,
                credentials,
                callbacks
            )
            Log(3, this, () -> "result=${result.Result}")
            let key IProfileKeyEx? = result.NewProfileKey
            switch result.Result {
                case EAuthorizeResult.Succ, EAuthorizeResult.DeregistrationFailed {
                    ProfileKey = key
                    CustomerName = (key?.AccountName)!!
                    AccountAlias = (key?.AccountName)!!
                    RegistrationSucceeded = true
                    CurrentStep = 2
                    UpdateStepState()
                    if result.Result == EAuthorizeResult.DeregistrationFailed {
                        LoginErrorMessage = "Note: A previous device \"${result.PrevDeviceName}\" could not be deregistered."
                    }
                }
                case EAuthorizeResult.AuthorizationFailed {
                    LoginErrorMessage = "Authorization failed. Please check your credentials and try again."
                }
                case EAuthorizeResult.RegistrationFailed {
                    LoginErrorMessage = "Device registration failed. Please try again."
                }
                default {
                    LoginErrorMessage = "An error occurred: ${result.Result}"
                }
            }
        } catch (OperationCanceledException) {
            LoginErrorMessage = "Sign-in was cancelled."
        } catch (ex TimeoutException) {
            LoginErrorMessage = "Connection timed out: ${ex.Message}"
        } catch (ex Exception) {
            Log(1, this, () -> "error: ${ex.Message}")
            LoginErrorMessage = "An error occurred: ${ex.Message}"
        } finally {
            IsProcessingResponse = false
            ShowChallenge = false
        }
    }

    @RelayCommand
    private func SubmitChallenge() {
        challengeTcs?.TrySetResult(ChallengeInput ?? string.Empty)
        ShowChallenge = false
    }

    @RelayCommand
    private func CancelChallenge() {
        challengeTcs?.TrySetResult(nil)
        ShowChallenge = false
    }

    private func HandleCaptchaCallback(imageData[]uint8) string {
        let tcs = TaskCompletionSource[string]()
        challengeTcs = tcs
        Dispatcher.UIThread.Post(
            () -> {
                ChallengeImage = Bitmap(MemoryStream(imageData))
                ChallengeInput = nil
                ChallengeMessage = "Please enter the text shown in the image:"
                ChallengeHasImage = true
                ChallengeHasInput = true
                ChallengeInputWatermark = "Enter CAPTCHA text"
                ChallengeSubmitText = "Submit"
                ShowChallenge = true
            }
        )
        return tcs.Task.GetAwaiter().GetResult()
    }

    private func HandleMfaCallback() string {
        let tcs = TaskCompletionSource[string]()
        challengeTcs = tcs
        Dispatcher.UIThread.Post(
            () -> {
                ChallengeImage = nil
                ChallengeInput = nil
                ChallengeMessage = "Enter the one-time password (OTP) sent to your device:"
                ChallengeHasImage = false
                ChallengeHasInput = true
                ChallengeInputWatermark = "Enter code"
                ChallengeSubmitText = "Submit"
                ShowChallenge = true
            }
        )
        return tcs.Task.GetAwaiter().GetResult()
    }

    private func HandleCvfCallback() string {
        let tcs = TaskCompletionSource[string]()
        challengeTcs = tcs
        Dispatcher.UIThread.Post(
            () -> {
                ChallengeImage = nil
                ChallengeInput = nil
                ChallengeMessage = "A verification code was sent to your registered email or phone. Enter it below:"
                ChallengeHasImage = false
                ChallengeHasInput = true
                ChallengeInputWatermark = "Enter verification code"
                ChallengeSubmitText = "Submit"
                ShowChallenge = true
            }
        )
        return tcs.Task.GetAwaiter().GetResult()
    }

    private func HandleApprovalCallback() {
        let tcs = TaskCompletionSource[string]()
        challengeTcs = tcs
        Dispatcher.UIThread.Post(
            () -> {
                ChallengeImage = nil
                ChallengeInput = nil
                ChallengeMessage = "Please approve the sign-in request on your device or email, then click Continue."
                ChallengeHasImage = false
                ChallengeHasInput = false
                ChallengeInputWatermark = nil
                ChallengeSubmitText = "Continue"
                ShowChallenge = true
            }
        )
        tcs.Task.GetAwaiter().GetResult()
    }

    private func BuildLoginUrl() {
        if client == nil {
            return
        }
        try {
            let uri = client!!.ConfigBuildNewLoginUri(SelectedRegion, UsePreAmazonAccount)
            LoginUrl = uri.ToString()
            LoginUrlCopied = false
            IsLoggingIn = false
            PastedResponseUrl = nil
            LoginErrorMessage = nil
        } catch (ex Exception) {
            LoginErrorMessage = ex.Message
        }
    }

    private func ApplyCurrentStepSettings() {
        switch CurrentStep {
            case 2 {
                if client != nil && ProfileKey != nil && !AccountAlias.IsNullOrWhiteSpace() {
                    client!!.SetAccountAlias(ProfileKey, AccountAlias)
                }
            }
            case 3 {
                if downloadSettings != nil && !DownloadDirectory.IsNullOrWhiteSpace() {
                    this.downloadSettings!!.DownloadDirectory = DownloadDirectory
                }
            }
            case 4 {
                if exportSettings != nil {
                    this.exportSettings!!.ExportToAax = ExportToAax
                    if ExportToAax && !ExportDirectory.IsNullOrWhiteSpace() {
                        this.exportSettings!!.ExportDirectory = ExportDirectory
                    }
                }
            }
        }
    }

    private func ApplyAllSettings() {
        // Apply account alias
        if client != nil && ProfileKey != nil && !AccountAlias.IsNullOrWhiteSpace() {
            client!!.SetAccountAlias(ProfileKey, AccountAlias)
        }
        // Apply download directory
        if downloadSettings != nil && !DownloadDirectory.IsNullOrWhiteSpace() {
            this.downloadSettings!!.DownloadDirectory = DownloadDirectory
        }
        // Apply export settings
        if exportSettings != nil {
            this.exportSettings!!.ExportToAax = ExportToAax
            if ExportToAax && !ExportDirectory.IsNullOrWhiteSpace() {
                this.exportSettings!!.ExportDirectory = ExportDirectory
            }
        }
        // Build completion message
        let key IProfileKeyEx? = ProfileKey
        if key != nil {
            CompletionMessage = ((`Setup complete!

`) + (`Region: ` + "${key.Region}" + `
`) + (`Account: ` + "${AccountAlias ?? key.AccountName}" + `
`) + "Device: ${key.DeviceName}" + (
                    if !DownloadDirectory.IsNullOrWhiteSpace() {
                        (`
Download folder: ` + "$DownloadDirectory")
                    } else {
                        ""
                    }
                ) + (
                    if ExportToAax {
                        (`
Export folder: ` + "$ExportDirectory")
                    } else {
                        ""
                    }
                ))
        } else {
            CompletionMessage = "Setup skipped. You can configure settings later."
        }
    }

    private func UpdateStepState() {
        IsComplete = CurrentStep >= 5
        CanGoBack = CurrentStep > 0 && CurrentStep < 5
        CanGoNext = switch CurrentStep {
            case 0: true
            case 1: false
            case 2: RegistrationSucceeded
            case 3: true
            case 4: true
            default: false
        }
        StepTitle = switch CurrentStep {
            case 0: "Select Marketplace"
            case 1: "Sign In to Audible"
            case 2: "Account Alias"
            case 3: "Download Folder"
            case 4: "Export Settings"
            case 5: "Setup Complete"
            default: string.Empty
        }
    }

    private func DeregisterDeviceConfirmation(key IProfileKeyEx) bool -> false

    private func GetAccountAliasFromWizard(ctxt AccountAliasContext) bool {
        // Pre-populate from context; the user will edit on step 2
        if ctxt.Alias.IsNullOrWhiteSpace() {
            ctxt.Alias = ctxt.CustomerName!!
        }
        CustomerName = ctxt.CustomerName!!
        AccountAlias = ctxt.Alias!!
        return true
    }

    shared {
        private let _stepConverter StepVisibilityConverter = StepVisibilityConverter()

        prop StepConverter StepVisibilityConverter {
            get {
                return _stepConverter
            }
        }

        private let _oneBasedConverter OneBasedConverter = OneBasedConverter()

        prop OneBasedConverter OneBasedConverter {
            get {
                return _oneBasedConverter
            }
        }
    }
}
