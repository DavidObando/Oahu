package Oahu.Aux

import System
import System.IO
import System.Reflection
import System.Resources
import System.Runtime.InteropServices
import System.Text.RegularExpressions

class ApplEnv {
    shared {
        private let InvalidChars[]char = Path.GetInvalidFileNameChars()
        private let _oSVersion Version = GetOsVersion()

        prop OSVersion Version {
            get {
                return _oSVersion
            }
        }

        prop Is64BitOperatingSystem bool -> Environment.Is64BitOperatingSystem
        prop Is64BitProcess bool -> Environment.Is64BitProcess
        prop ProcessorCount int32 -> Environment.ProcessorCount
        private let _entryAssembly Assembly? = Assembly.GetEntryAssembly()

        prop EntryAssembly Assembly? {
            get {
                return _entryAssembly
            }
        }

        private let _executingAssembly Assembly = Assembly.GetExecutingAssembly()

        prop ExecutingAssembly Assembly {
            get {
                return _executingAssembly
            }
        }

        private let _assemblyVersion string = ThisAssembly.AssemblyFileVersion

        prop AssemblyVersion string {
            get {
                return _assemblyVersion
            }
        }

        private let _assemblyTitle string = GetAttribute[AssemblyTitleAttribute]()?.Title ??
            Path.GetFileNameWithoutExtension(ExecutingAssembly.Location)

        prop AssemblyTitle string {
            get {
                return _assemblyTitle
            }
        }

        private let _assemblyProduct string? = GetAttribute[AssemblyProductAttribute]()?.Product

        prop AssemblyProduct string? {
            get {
                return _assemblyProduct
            }
        }

        private let _assemblyCopyright string? = GetAttribute[AssemblyCopyrightAttribute]()?.Copyright

        prop AssemblyCopyright string? {
            get {
                return _assemblyCopyright
            }
        }

        private let _assemblyCompany string? = GetAttribute[AssemblyCompanyAttribute]()?.Company

        prop AssemblyCompany string? {
            get {
                return _assemblyCompany
            }
        }

        private let _neutralCultureName string? = GetAttribute[NeutralResourcesLanguageAttribute]()?.CultureName

        prop NeutralCultureName string? {
            get {
                return _neutralCultureName
            }
        }

        private let _assemblyGuid string? = GetAttribute[GuidAttribute]()?.Value

        prop AssemblyGuid string? {
            get {
                return _assemblyGuid
            }
        }

        private var _applName string? = EntryAssembly!!.GetName().Name

        prop ApplName string? {
            get {
                return _applName
            }
            private set {
                _applName = value
            }
        }

        private let _applDirectory string = AppContext.BaseDirectory

        prop ApplDirectory string {
            get {
                return _applDirectory
            }
        }

        private let _localDirectoryRoot string = Environment.GetFolderPath(
            Environment.SpecialFolder.LocalApplicationData
        )

        prop LocalDirectoryRoot string {
            get {
                return _localDirectoryRoot
            }
        }

        prop LocalApplDirectory string -> Path.Combine(LocalDirectoryRoot, ApplName!!)
        prop SettingsDirectory string -> Path.Combine(LocalApplDirectory, "settings")
        prop TempDirectory string -> Path.Combine(LocalApplDirectory, "tmp")
        prop LogDirectory string -> Path.Combine(LocalApplDirectory, "log")
        private let _userName string = Environment.UserName

        prop UserName string {
            get {
                return _userName
            }
        }

        private let _userDirectoryRoot string = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)

        prop UserDirectoryRoot string {
            get {
                return _userDirectoryRoot
            }
        }

        /// Override the assembly-derived (cref:ApplName) so that all path
        /// derivatives ((cref:LocalApplDirectory), (cref:SettingsDirectory),
        /// (cref:TempDirectory), (cref:LogDirectory)) resolve under a
        /// shared name. Used by `oahu-cli` to coexist on the same machine as the
        /// Avalonia GUI by routing both front-ends to the GUI's `Oahu` data root.
        ///
        /// Must be called before any code path touches the affected directories or
        /// any type that captures them in static fields (e.g. before
        /// `Oahu.Core.AudibleClient`, `Oahu.BooksDatabase.BookDbContext`).
        func OverrideApplName(name string) {
            if string.IsNullOrWhiteSpace(name) {
                throw ArgumentException("name must not be null or empty", "name")
            }
            ApplName = name
        }

        private func GetAttribute[T Attribute]() T? {
            let attributes = EntryAssembly!!.GetCustomAttributes(typeof(T), false)
            if attributes.Length == 0 {
                return nil
            }
            return attributes[0] as T
        }

        private func GetOsVersion() Version {
            const REGEX = "\\s([0-9.]+)"
            let os = RuntimeInformation.OSDescription
            let regex = Regex(REGEX)
            let match = regex.Match(os)
            if !match.Success {
                return Version()
            }
            let osvers = match.Groups[1].Value
            try {
                return Version(osvers)
            } catch (Exception) {
                return Version()
            }
        }
    }
}
