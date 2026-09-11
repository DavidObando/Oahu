package Oahu.Core

import Oahu.Audible.Json
import Oahu.Aux.Extensions
import Oahu.BooksDatabase
import Oahu.Common.Util
import Oahu.CommonTypes
import System
import System.Collections.Generic
import System.Threading

open data class Callbacks {
    prop CaptchaCallback(([]uint8) -> string)? {
        get;
        init;
    }

    prop ApprovalCallback(() -> void)? {
        get;
        init;
    }

    prop MfaCallback(() -> string)? {
        get;
        init;
    }

    prop CvfCallback(() -> string)? {
        get;
        init;
    }

    prop ExternalLoginCallback((Uri) -> Uri)? {
        get;
        init;
    }

    prop DeregisterDeviceConfirmCallback(IProfileKeyEx) -> bool {
        get;
        init;
    }

    prop GetAccountAliasFunc(AccountAliasContext) -> bool {
        get;
        init;
    }
}

open data class Credentials(Username string, Password string) { }

open data class CredentialsUrl(Credentials Credentials, BaseUriString string) : Credentials(
    Credentials.Username,
    Credentials.Password
) { }

open data class RegisterResult(Result EAuthorizeResult, NewProfileKey IProfileKeyEx?, PrevDeviceName string?) { }

open data class ProfileKey(Id uint32, Region ERegion, AccountId string?) : IProfileKey {
    open override func ToString() string -> "${GetType().Name} ${"Id"}=$Id, ${"Region"}=$Region, ${"AccountId"}=#<${AccountId.Checksum32()}>"
}

open data class ProfileKeyEx(
    Id uint32,
    Region ERegion,
    AccountName string?,
    AccountId string?,
    DeviceName string?
) : ProfileKey(Id, Region, AccountId),
IProfileKeyEx {
    open override func ToString() string -> "${base.ToString()}, ${"AccountName"}=#<${AccountName.Checksum32}>, ${"DeviceName"}=#<${DeviceName.Checksum32()}>"
}

open data class ProfileId(AccountId int32, Region ERegion) { }

open data class AccountAlias(AccountId string, Alias string?) { }

open data class SimpleConversionContext(Progress IProgress[ProgressMessage]?, CancellationToken CancellationToken) { }

open data class BookLibInteract(Kind EBookLibInteract) { }

open data class ChapterExtract(Title string, Length int32) { }

internal open data class ProductComponentPair(Product Product, Component Component) { }

internal open data class ProfileBundle(Profile IProfile, Key IProfileKey, AliasKey IProfileAliasKey?) { }

internal open data class BookCompositeLists(
    BookAsins List[string],
    KnownAccountIds List[int32],
    Conversions List[Conversion],
    Components List[Component],
    Series List[Oahu.BooksDatabase.Series],
    SeriesBooks List[SeriesBook],
    Authors List[Oahu.BooksDatabase.Author],
    Narrators List[Oahu.BooksDatabase.Narrator],
    Genres List[Genre],
    Ladders List[Oahu.BooksDatabase.Ladder],
    Rungs List[Rung],
    Codecs List[Oahu.BooksDatabase.Codec]
) { }

internal open data class ConfigurationTokenResult(Token string, Weak bool) { }
