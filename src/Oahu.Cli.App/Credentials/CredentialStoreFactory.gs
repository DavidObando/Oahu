package Oahu.Cli.App.Credentials

import Oahu.Cli.App.Paths
import System
import System.IO
import System.Runtime.InteropServices

/// Picks the platform-appropriate (cref:ICredentialStore). Returns
/// (cref:UnsupportedCredentialStore) when no native keyring is available so
/// the caller can fail closed with a clear remediation message instead of silently
/// storing secrets in a file (per design / rubber-duck guidance).
class CredentialStoreFactory {
    shared {
        func Create() ICredentialStore -> Create(CliPaths.ConfigDir)

        func Create(configDir string) ICredentialStore {
            if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                return WindowsDpapiCredentialStore(Path.Combine(configDir, "credentials.dpapi"))
            }
            if RuntimeInformation.IsOSPlatform(OSPlatform.OSX) {
                return MacOsKeychainCredentialStore()
            }
            if RuntimeInformation.IsOSPlatform(OSPlatform.Linux) {
                // libsecret might still be missing — but that surfaces lazily as
                // CredentialStoreUnavailableException on first use, with a clear message.
                return LinuxSecretToolCredentialStore()
            }
            return UnsupportedCredentialStore("Unrecognised OS platform: ${RuntimeInformation.OSDescription}")
        }
    }
}
