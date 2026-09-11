package Oahu.Aux

import System
import System.Collections.Generic
import System.IO

/// Simple settings manager for app and user settings serialized as json.
/// Does not use Microsoft.Extensions.Configuration
class SettingsManager {
    private class UserConfig {
        prop Settings object?
        prop File string?
    }

    shared {
        /// The application settings file
        const AppSettingsFile string = "appsettings" + JSON

        /// The user settings file
        const UserSettingsFile string = "usersettings" + JSON

        const SettingsTemplateFileSuffix string = ".template" + JSON
        private const JSON string = ".json"
        private var userSettingsDict Dictionary[Type, UserConfig] = Dictionary[Type, UserConfig]()
        private var appSettings object?

        /// Gets the application settings directory.
        prop AppSettingsDirectory string -> ApplEnv.ApplDirectory

        /// Gets the user settings directory.
        prop UserSettingsDirectory string -> ApplEnv.SettingsDirectory

        /// Gets the type-safe application settings.
        /// @typeparam T Type of the application settings
        /// @param optional Whether app settings file must exist.
        /// @returns Application settings, or new default instance if optional and not found.
        func GetAppSettings[T class init()](optional bool = false) T? {
            var settings T? = appSettings as T
            if settings == nil {
                let path = Path.Combine(AppSettingsDirectory, AppSettingsFile)
                let exists = File.Exists(path)
                if !optional && !exists {
                    throw InvalidOperationException("$path not found.")
                }
                settings = DeserializeJsonFile[T](path, !optional)
                if settings == nil {
                    // if (!optional)
                    //  throw new InvalidOperationException ($"{path}: content does not match.");
                    // else
                    settings = T()
                    if settings is IInitSettings init {
                        init.Init()
                    }
                }
                appSettings = settings
            }
            return settings
        }

        /// Gets the type-safe user settings for one type. Tries for a preset in the application directory,
        /// if settings can not be found at the designated user settings directory.
        /// @typeparam T Type of the user settings.
        /// @param renew Always reads from file and updates existing instance if set to `true`.
        /// @param settingsFile The settings file. Required for each additional type
        /// if more than one type will be used. Can be file name only without directory.
        /// .json will be added if ncessary.
        /// @returns User settings, or new default instance if no settings found.
        func GetUserSettings[T IUserSettings class init()](
            renew bool = false,
            settingsFile string? = nil
        ) T? -> GetUserSettings[T](settingsFile, renew)

        /// Gets the type-safe user settings for one type. Tries for a preset in the application directory,
        /// if settings can not be found at the designated user settings directory.
        /// @typeparam T Type of the user settings.
        /// @param settingsFile The settings file. Required for each additional type
        /// if more than one type will be used. Can be file name only without directory.
        /// .json will be added if ncessary.
        /// @param renew Always reads from file and updates existing instance if set to `true`.
        /// @returns User settings, or new default instance if if no settings found.
        func GetUserSettings[T IUserSettings class init()](settingsFile string?, renew bool = false) T? {
            var settings T? = nil
            if !renew {
                lock userSettingsDict {
                    let succ = userSettingsDict.TryGetValue(typeof(T), out var userConfig)
                    if succ {
                        settings = userConfig.Settings as T
                    }
                }
            }
            if settings == nil {
                let (dir, file) = GetUserSettingsPath(settingsFile)
                var path = Path.Combine(dir!!, file!!)
                settings = DeserializeJsonFile[T](path)
                if settings == nil {
                    path = Path.Combine(AppSettingsDirectory, file!!)
                    settings = DeserializeJsonFile[T](path)
                }
                if settings == nil {
                    settings = T()
                }
                lock userSettingsDict {
                    let succ = userSettingsDict.TryGetValue(typeof(T), out var userConfig)
                    if succ && userConfig.Settings != settings {
                        userConfig.Settings = settings
                    } else {
                        userConfig = UserConfig{Settings: settings, File: settingsFile}
                        userSettingsDict[typeof(T)] = userConfig
                    }
                }
                if settings is IInitSettings init {
                    init.Init()
                }
            }
            return settings
        }

        /// Saves the specified user settings to the designated user settings directory.
        /// Writes to type-specific file, specified when reading the settings.
        /// @typeparam T Type of the user settings
        func Save[T IUserSettings](settings T) bool {
            var settingsFile string?
            // use actual arg type, not the generic type which may be an interface.
            let type = settings.GetType()
            lock SettingsManager.userSettingsDict {
                let succ = SettingsManager.userSettingsDict.TryGetValue(type, out var userConfig)
                if !succ {
                    return false
                }
                if !object.ReferenceEquals(userConfig.Settings, settings) {
                    userConfig.Settings = settings
                }
                settingsFile = userConfig.File
            }
            let (dir, file) = SettingsManager.GetUserSettingsPath(settingsFile)
            Directory.CreateDirectory(dir!!)
            let filename = Path.Combine(dir!!, file!!)
            try {
                settings.ToJsonFile(filename)
                return true
            } catch (IOException) {
                return false
            }
        }

        private func GetUserSettingsPath(settingsFile string?)(Dir string?, Path string?) {
            if string.IsNullOrWhiteSpace(settingsFile) {
                return (UserSettingsDirectory, UserSettingsFile)
            }
            var dir string? = Path.GetDirectoryName(settingsFile)
            if string.IsNullOrWhiteSpace(dir) {
                dir = UserSettingsDirectory
            }
            var file string? = Path.GetFileName(settingsFile)
            if !string.IsNullOrWhiteSpace(file) {
                let ext = Path.GetExtension(file).ToLower()
                if ext != JSON {
                    file += JSON
                }
            }
            return (dir, file)
        }

        private func DeserializeJsonFile[T class init()](path string, doThrow bool = false) T? {
            try {
                return path.FromJsonFile[T]()
            } catch (exc Exception) {
                if doThrow {
                    throw InvalidOperationException(path, exc)
                }
                return nil
            }
        }
    }
}

func (settings T) Save[T IUserSettings]() bool {
    return SettingsManager.Save[T](settings)
}
