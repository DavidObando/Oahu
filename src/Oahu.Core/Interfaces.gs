package Oahu.Core

import Oahu.Audible.Json
import Oahu.Aux
import Oahu.BooksDatabase
import Oahu.CommonTypes
import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

interface IProfileKey {
    prop Id uint32 {
        get;
    }

    prop Region ERegion {
        get;
    }

    prop AccountId string? {
        get;
    }
}

interface IProfileKeyEx : IProfileKey {
    prop AccountName string? {
        get;
    }

    prop DeviceName string? {
        get;
    }
}

interface IProfileAliasKey {
    prop AccountAlias string? {
        get;
    }

    prop Region ERegion {
        get;
    }
}

interface ICancellation {
    prop CancellationToken CancellationToken {
        get;
    }
}

interface IBookLibrary {
    func GetBooks(profileId ProfileId) IEnumerable[Book];

    func GetChapters(item IBookCommon);

    func GetChaptersFlattened(item IBookCommon, accuChapters List[List[ChapterExtract]]) IEnumerable[
        Oahu.BooksDatabase.Chapter
    ];

    func GetPersistentState(conversion Conversion) EConversionState;

    func SavePersistentState(conversion Conversion, state EConversionState);
}

interface IAudibleApi : IProfileAliasKey, IDisposable {
    prop RefreshTokenAsyncFunc async () -> void {
        get;
    }

    prop GetAccountAliasFunc(AccountAliasContext) -> bool {
        set;
    }

    func GetLibraryAsync(resync bool) Task[LibraryResponse?];

    func GetAccountInfoAsync() Task[string?];

    func GetUserProfileAsync() Task[string?];

    func GetActivationBytesAsync() Task[bool];

    func GetDownloadLicenseAsync(asin string, quality EDownloadQuality) Task[LicenseResponse?];

    func DownloadAsync(
        conversion Conversion,
        progressAction(Conversion, int64) -> void,
        cancToken CancellationToken
    ) Task[bool];

    func DecryptAsync(
        conversion Conversion,
        progressAction(Conversion, TimeSpan) -> void,
        cancToken CancellationToken
    ) Task[bool];

    func DownloadCoverImagesAsync() Task;

    func UpdateMetaInfo(components IEnumerable[Component], onDone(IEnumerable[Component]) -> void) Task;

    func GetDownloadLicenseAndSaveAsync(conversion Conversion, quality EDownloadQuality) Task[bool];

    func GetBooks() IEnumerable[Book];

    func SavePersistentState(conversion Conversion, state EConversionState);

    func RestorePersistentState(conversion Conversion);

    func GetPersistentState(conversion Conversion) EConversionState;

    func CheckUpdateFilesAndState(
        downloadSettings IDownloadSettings,
        exportSettings IExportSettings,
        callbackRefConversion(IConversion) -> void,
        interactCallback IInteractionCallback[InteractionMessage[BookLibInteract], bool?]
    );

    func VerifyCompletedDownloads(downloadSettings IDownloadSettings, exportSettings IExportSettings) int32;
}

internal interface IProfile {
    prop Id uint32 {
        get;
    }

    prop PreAmazon bool {
        get;
    }

    prop Region ERegion {
        get;
    }

    prop Authorization IAuthorization {
        get;
    }

    prop CustomerInfo ICustomerInfo? {
        get;
    }

    prop DeviceInfo IDeviceInfo? {
        get;
    }

    prop Token ITokenBearer {
        get;
    }

    prop Cookies IEnumerable[KeyValuePair[string, string]] {
        get;
    }

    prop PrivateKey string {
        get;
    }

    prop AdpToken string {
        get;
    }

    prop StoreAuthentCookie string {
        get;
    }

    func Refresh(token TokenBearer);
}

internal interface IAuthorization {
    prop AuthorizationCode string? {
        get;
    }

    prop CodeVerifier string {
        get;
    }
}

internal interface ITokenBearer {
    prop RefreshToken string? {
        get;
    }

    prop AccessToken string? {
        get;
    }

    prop Expiration DateTime {
        get;
    }
}

internal interface IDeviceInfo {
    prop Type string {
        get;
    }

    prop Name string {
        get;
    }

    prop Serial string?
}

internal interface ICustomerInfo {
    prop Name string {
        get;
    }

    prop GivenName string {
        get;
    }

    prop AccountId string {
        get;
    }
}
