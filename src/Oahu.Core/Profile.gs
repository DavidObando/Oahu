package Oahu.Core

import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.CommonTypes
import Oahu.Core.Ex
import System
import System.Collections.Generic
import System.Collections.Specialized
import System.Diagnostics.CodeAnalysis
import System.IO
import System.Linq
import System.Text.Json
import System.Text.Json.Serialization.Metadata
import System.Threading.Tasks
import System.Web

internal class Authorization : IAuthorization {
    prop AuthorizationCode string?
    prop CodeVerifier string

    shared {
        func Create(uri Uri?) Authorization? {
            const AUTH_KEY = "openid.oa2.authorization_code"
            if !uri!!.IsAbsoluteUri {
                return nil
            }
            let query string? = uri!!.Query
            if query == nil {
                return nil
            }
            let paras = HttpUtility.ParseQueryString(query)
            let auth string? = paras[AUTH_KEY]
            if auth == nil {
                return nil
            }
            return Authorization{AuthorizationCode: auth}
        }
    }
}

internal class TokenBearer : ITokenBearer {
    init() { }

    init(accToken string?, expiration DateTime) {
        AccessToken = accToken
        Expiration = expiration
    }

    convenience init(accToken string, refrToken string, expiration DateTime) {
        init(accToken, expiration)
        RefreshToken = refrToken
    }

    prop RefreshToken string?
    prop AccessToken string?
    prop Expiration DateTime

    shared {
        func Create(uri Uri) TokenBearer? {
            const TOKEN_KEY = "openid.oa2.access_token"
            const EXPIR_KEY = "openid.pape.auth_time"
            if !uri.IsAbsoluteUri {
                return nil
            }
            let query string? = uri.Query
            if query == nil {
                return nil
            }
            let paras = HttpUtility.ParseQueryString(query)
            let token string? = paras[TOKEN_KEY]
            let expir string? = paras[EXPIR_KEY]
            if token == nil || expir == nil {
                return nil
            }
            DateTime.TryParse(expir, out var expirTime)
            expirTime += TimeSpan.FromHours(1)
            expirTime = expirTime.ToUniversalTime()
            let acctoken = TokenBearer(token, expirTime)
            if !Validate(acctoken) {
                return nil
            }
            return acctoken
        }

        func Validate(token TokenBearer?) bool {
            const ACC_TOKEN_STUB = "Atna|"
            const REFR_TOKEN_STUB = "Atnr|"
            if token == nil {
                return false
            }
            if token.AccessToken == nil || !token.AccessToken!!.StartsWith(ACC_TOKEN_STUB) {
                return false
            }
            if token.RefreshToken != nil && !token.RefreshToken!!.StartsWith(REFR_TOKEN_STUB) {
                return false
            }
            let utcnow = DateTime.UtcNow
            return token.Expiration > utcnow
        }
    }
}

internal class DeviceInfo : IDeviceInfo {
    prop Type string
    prop Name string
    prop Serial string?
}

internal class CustomerInfo : ICustomerInfo {
    prop Name string
    prop GivenName string
    prop AccountId string
}

internal class Profile : IProfile {
    init() { }

    init(region ERegion, token TokenBearer, cookies IEnumerable[KeyValuePair[string, string]], serial string) {
        Region = region
        Token = token
        Cookies = cookies
        DeviceInfo = DeviceInfo{Serial: serial}
    }

    init(region ERegion, authorization Authorization?, serial string?, preAmazonAccount bool) {
        Region = region
        Authorization = authorization
        DeviceInfo = DeviceInfo{Serial: serial}
        PreAmazon = preAmazonAccount
    }

    prop Id uint32
    prop PreAmazon bool
    prop Region ERegion
    prop Authorization Authorization?
    prop Token TokenBearer
    prop DeviceInfo DeviceInfo
    prop CustomerInfo CustomerInfo
    prop Cookies IEnumerable[KeyValuePair[string, string]]
    prop PrivateKey string
    prop AdpToken string
    prop StoreAuthentCookie string
    private prop(IProfile) Authorization IAuthorization -> Authorization!!
    private prop(IProfile) Token ITokenBearer -> Token
    private prop(IProfile) DeviceInfo IDeviceInfo? -> DeviceInfo
    private prop(IProfile) CustomerInfo ICustomerInfo? -> CustomerInfo

    func Update(
        token TokenBearer,
        cookies IEnumerable[KeyValuePair[string, string]],
        device DeviceInfo,
        customer CustomerInfo,
        privateKey string,
        adpToken string,
        storeAuthentCookie string
    ) {
        Token = token
        Cookies = cookies
        DeviceInfo = device
        CustomerInfo = customer
        PrivateKey = privateKey
        AdpToken = adpToken
        StoreAuthentCookie = storeAuthentCookie
        // TODO validate inputs

    }

    func Refresh(token TokenBearer) {
        this.Token.AccessToken = token.AccessToken
        this.Token.Expiration = token.Expiration
    }
}

internal class Configuration {
    private var profiles List[Profile]?
    prop Profiles IReadOnlyList[Profile]? -> profiles

    prop Existed bool {
        get;
        private set;
    }

    prop IsEncrypted bool {
        get;
        private set;
    }

    func AddOrReplace(profile Profile?) IProfile? {
        if profiles == nil {
            profiles = List[Profile]()
        }
        // uniqueness constraint is customer account id and region
        // this may create zombies unless old profile device is deregistered
        var nextId uint32 = uint32(0)
        if profiles!!.Any() {
            nextId = profiles!!.Select((p Profile) -> p.Id).Max() + uint32(1)
        }
        profile!!.Id = nextId
        let existing Profile? = Profiles!!.FirstOrDefault((d Profile) -> d.Matches(profile))
        if existing == nil {
            profiles!!.Add(profile!!)
            return nil
        }
        let i = profiles!!.IndexOf(existing)
        let prevProfile IProfile = profiles!![i]
        profiles!![i] = profile!!
        return prevProfile
    }

    func Remove(key IProfileKey) IProfile? {
        if Profiles == nil {
            return nil
        }
        let existing Profile? = Profiles!!.FirstOrDefault((d Profile) -> d.Matches(key))
        if existing == nil {
            return nil
        }
        let succ = profiles!!.Remove(existing)
        return existing
    }

    func Get(key IProfileKey) Profile? -> Profiles?.FirstOrDefault((p Profile) -> p.Matches(key))

    func GetSorted() IEnumerable[Profile]? {
        // by customer and region
        return Profiles?.OrderBy((p Profile) -> p.CustomerInfo.AccountId).ThenBy((p Profile) -> p.Region).ToList()
    }

    async func ReadAsync(token string?) {
        let config SerializableConfig? = await FileExtensions.ReadJsonFileAsync[SerializableConfig](
            ConfigDir,
            this.GetType().Name
        )
        if config == nil {
            return
        }
        Existed = true
        let encrypted = !token.IsNullOrWhiteSpace()
        Logging.Log(3, this, () -> "${(if encrypted { "decrypt" } else { string.Empty })}")
        if !token.IsNullOrWhiteSpace() {
            Decrypt(config, token)
        }
        IsEncrypted = config.Profiles == nil && !config.Secure.IsNullOrWhiteSpace()
        profiles = config.Profiles
    }

    async func WriteAsync(token string?) {
        let config = SerializableConfig{Profiles: profiles}
        let encrypted = !token.IsNullOrWhiteSpace()
        Logging.Log(3, this, () -> "${(if encrypted { "encrypt" } else { string.Empty })}")
        if encrypted {
            Encrypt(config, token)
        }
        Existed = true
        Directory.CreateDirectory(ConfigDir)
        await config.WriteJsonFileAsync(ConfigDir, this.GetType().Name)
    }

    private class SerializableConfig {
        prop Profiles List[Profile]?
        prop Secure string?
    }

    shared {
        private prop ConfigDir string -> Path.Combine(ApplEnv.LocalApplDirectory, "config")

        @UnconditionalSuppressMessage(
            "Trimming",
            "IL2026",
            Justification: "SerializableConfig and Profile types are preserved via TrimMode=partial."
        )
        private func Encrypt(configuration SerializableConfig, token string?) {
            if configuration.Profiles == nil {
                return
            }
            let json = JsonSerializer.Serialize(
                configuration.Profiles!!,
                JsonSerializerOptions{TypeInfoResolver: DefaultJsonTypeInfoResolver()}
            )
            let encrypted = SymmetricEncryptor.EncryptString(json, token)
            let base64 = Convert.ToBase64String(encrypted)
            configuration.Secure = base64
            configuration.Profiles = nil
        }

        @UnconditionalSuppressMessage(
            "Trimming",
            "IL2026",
            Justification: "SerializableConfig and Profile types are preserved via TrimMode=partial."
        )
        private func Decrypt(configuration SerializableConfig?, token string?) {
            if configuration!!.Secure == nil || configuration!!.Secure.IsNullOrWhiteSpace() {
                return
            }
            try {
                let encrypted = Convert.FromBase64String(configuration!!.Secure!!)
                let json = SymmetricEncryptor.DecryptToString(encrypted, token)
                let profiles List[Profile]? = JsonSerializer.Deserialize[List[Profile]](
                    json,
                    JsonSerializerOptions{TypeInfoResolver: DefaultJsonTypeInfoResolver()}
                )
                configuration!!.Profiles = profiles
                configuration!!.Secure = nil
            } catch (Exception) { }
        }
    }
}
