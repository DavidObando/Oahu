package Oahu.Core

import Oahu.Audible.Json
import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.Aux.Logging
import Oahu.BooksDatabase
import Oahu.CommonTypes
import Oahu.Core.Ex
import Oahu.Decrypt
import R = Oahu.Core.Properties.Resources
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Net.Http
import System.Security.Cryptography
import System.Text
import System.Threading
import System.Threading.Tasks

internal class AudibleApi : IAudibleApi {
    private var accountId int32
    private var accountAlias string?

    init(
        profile IProfile?,
        httpClientAmazon HttpClientEx?,
        httpClientAudible HttpClientEx?,
        bookLibrary BookLibrary,
        refreshTokenAsyncFunc async (IProfile?) -> void
    ) {
        BookLibrary = bookLibrary
        RefreshTokenAsyncFunc = () -> refreshTokenAsyncFunc(Profile!!)
        if profile == nil {
            return
        }
        Profile = profile
        HttpClientAmazon = httpClientAmazon
        HttpClientAudible = httpClientAudible
        // ILocale locale = profile.Region.FromCountryCode ();
        // Uri baseUriAudible = new Uri (HTTP_AUTHORITY_AUDIBLE + locale.Domain);
        // HttpClientAudible = HttpClientEx.Create (baseUriAudible);

    }

    internal init(bookLibrary BookLibrary, accountId int32, region ERegion) {
        BookLibrary = bookLibrary
        this.accountId = accountId
        Profile = Profile(region, nil, nil, false)
    }

    prop AccountAlias string? {
        get {
            EnsureAccountId()
            return accountAlias
        }
    }

    prop Region ERegion -> Profile!!.Region

    prop GetAccountAliasFunc(AccountAliasContext) -> bool {
        private get;
        set;
    }

    prop RefreshTokenAsyncFunc async () -> void {
        get;
        private set;
    }

    internal prop HasAdpToken bool -> !string.IsNullOrEmpty(Profile?.AdpToken)
    internal prop HasPrivateKey bool -> !string.IsNullOrEmpty(Profile?.PrivateKey)
    internal prop HasAccessToken bool -> !string.IsNullOrEmpty(Profile?.Token?.AccessToken)

    // private string BaseUrlAudible { get; }
    // private Uri BaseUriAudible => HttpClientAudible?.BaseAddress;
    // private Uri BaseUriAmazon => HttpClientAmazon?.BaseAddress;
    private prop Profile IProfile? {
        get;
        init;
    }

    private prop HttpClientAudible HttpClientEx? {
        get;
        init;
    }

    private prop HttpClientAmazon HttpClientEx? {
        get;
        init;
    }

    private prop BookLibrary BookLibrary {
        get;
        init;
    }

    private prop AccountId int32 {
        get {
            EnsureAccountId()
            return accountId
        }
    }

    private prop HttpClient HttpClientEx -> if Profile!!.PreAmazon {
        HttpClientAudible!!
    } else {
        HttpClientAmazon!!
    }

    func Dispose() {
        // HttpClientAudible?.Dispose ();

    }

    async func GetLibraryAsync(resync bool) LibraryResponse? -> await GetLibraryAsync(nil, resync)

    async func GetUserProfileAsync() string? {
        using let logGuard = LogGuard(3, this)
        await RefreshTokenAsyncFunc()
        let url = "/user/profile?access_token=${Profile!!.Token.AccessToken}"
        let request = HttpRequestMessage(HttpMethod.Get, url)
        return await SendForStringAsync(request, HttpClient)
    }

    async func GetAccountInfoAsync() string? {
        using let logGuard = LogGuard(3, this)
        const GROUPS = "response_groups=migration_details,subscription_details_rodizio,subscription_details_premium,customer_segment,subscription_details_channels"
        let url = "/1.0/customer/information" + "?" + GROUPS
        return await CallAudibleApiSignedForStringAsync(url)
    }

    async func GetActivationBytesAsync() bool {
        using let logGuard = LogGuard(3, this)
        let url = "/license/token?action=register&player_manuf=Audible,Android&player_model=Android"
        let response[]?uint8 = await CallAudibleApiSignedForBytesAsync(url)
        return false
    }

    async func GetDownloadLicenseAsync(asin string, quality EDownloadQuality) LicenseResponse? {
        using let logGuard = LogGuard(3, this, () -> "asin=$asin")
        let response string? = await GetDownloadLicenseAsyncInternal(asin, quality)
        if Logging.Level >= 3 {
            let file string? = response.WriteTempJsonFile("LicenseResponse_$asin")
            Log(3, this, () -> "asin=$asin, file=\"${Path.GetFileName(file)}\"")
        }
        let license LicenseResponse? = LicenseResponse.Deserialize(response)
        DecryptLicense(license?.ContentLicense)
        return license
    }

    async func GetDownloadLicenseAndSaveAsync(conversion Conversion, quality EDownloadQuality) bool {
        using let logGuard = LogGuard(3, this, () -> "$conversion")
        Log(3, this, () -> "$conversion; desired quality: $quality")
        var licresp LicenseResponse?
        // A conversion reloaded from the database can still carry a terminal state (e.g.
        // LicenseDenied) from an earlier attempt. Clear it before the request so observers do not
        // report a stale failure for a license call that is still in flight.
        conversion.FailureReason = nil
        conversion.State = EConversionState.Download
        // get license
        try {
            licresp = await GetDownloadLicenseAsync(conversion.Asin!!, quality)
        } catch (exc Exception) {
            conversion.State = EConversionState.LicenseDenied
            conversion.FailureReason = exc.Summary()
            Log(1, this, () -> "$conversion; ${conversion.FailureReason}")
            return false
        }
        let lic ContentLicense? = licresp?.ContentLicense
        if lic == nil {
            conversion.State = EConversionState.LicenseDenied
            conversion.FailureReason = "no content license in response"
            Log(1, this, () -> "$conversion; ${conversion.FailureReason}.")
            return false
        }
        let succ = Enum.TryParse[ELicenseStatusCode](lic.StatusCode, out var status)
        if !succ || status != ELicenseStatusCode.Granted {
            conversion.State = EConversionState.LicenseDenied
            conversion.FailureReason = DescribeDenial(lic)
            // Always log the unabridged Amazon detail; FailureReason may be a summary.
            Log(1, this, () -> "$conversion; ${DescribeDenialVerbose(lic)}")
            if IsEntitlementDenial(lic) {
                BookLibrary.MarkBookUnavailable(conversion.Asin!!, ProfileId(AccountId, Region))
            }
            return false
        }
        if lic.Voucher == nil {
            conversion.State = EConversionState.LicenseDenied
            conversion.FailureReason = "license decryption failed"
            Log(1, this, () -> "$conversion; ${conversion.FailureReason}.")
            return false
        }
        conversion.FailureReason = nil
        // save license to DB, including chapters
        // update state
        let aq AudioQuality? = BookLibrary.UpdateLicenseAndChapters(lic, conversion, quality)
        Log(3, this, () -> "$conversion; done, $aq")
        return true
    }

    async func DownloadAsync(
        conversion Conversion,
        progressAction(Conversion, int64) -> void,
        cancToken CancellationToken
    ) bool {
        conversion.State = EConversionState.Downloading
        using let logGuard = LogGuard(3, this, () -> conversion.ToString())
        try {
            if conversion.DownloadUrl == nil {
                return false
            }
            let requestUri = Uri(conversion.DownloadUrl!!)
            let request = HttpRequestMessage(HttpMethod.Get, requestUri)
            request.Headers.UserAgent.ParseAdd(UserAgent)
            let response = await HttpClientAudible!!.SendAsync(request, HttpCompletionOption.ResponseHeadersRead)
            response.EnsureSuccessStatusCode()
            let destfilename = (conversion.DownloadFileName + R.EncryptedFileExt).AsUncIfLong()
            let sourceFileSize = conversion.BookCommon!!.FileSizeBytes ?? int64(0)
            if sourceFileSize == int64(0) {
                return false
            }
            Log(3, this, () -> "$conversion; size=${sourceFileSize / int64((1024 * 1024))} MB")
            using let networkStream = await response.Content.ReadAsStreamAsync(cancToken)
            using let rdr = BufferedStream(networkStream)
            using let fileStream = File.OpenWrite(destfilename)
            using let wrtr = BufferedStream(fileStream)
            let accusize = await Task.Run(
                async () -> await CopyStreams(conversion, rdr, wrtr, progressAction, cancToken),
                cancToken
            )
            let succ = accusize >= sourceFileSize
            if !succ {
                conversion.State = EConversionState.DownloadError
            } else {
                BookLibrary.SavePersistentState(conversion, EConversionState.LocalLocked)
            }
            Log(3, this, () -> "$conversion; download finished, succ=$succ.")
            return succ
        } catch (exc Exception) {
            conversion.State = EConversionState.DownloadError
            Log(1, this, () -> "$conversion; ${exc.Summary()}")
        }
        return false
    }

    async func DecryptAsync(
        conversion Conversion,
        progressAction(Conversion, TimeSpan) -> void,
        cancToken CancellationToken
    ) bool {
        let Rename = func (file string, suffix string) {
            let dir string? = Path.GetDirectoryName(file)
            let stub = Path.GetFileNameWithoutExtension(file)
            let ext = Path.GetExtension(file)
            let sfxfile = Path.Combine(dir!!, stub + suffix + ext)
            File.Move(file, sfxfile, true)
        }
        conversion.State = EConversionState.Unlocking
        using let logGuard = LogGuard(3, this, () -> conversion.ToString())
        var aaxFile AaxFile? = nil
        let rg = ResourceGuard(() -> aaxFile?.Dispose())
        var succ = false
        var numChannels = 0
        let inputFile = (conversion.DownloadFileName + R.EncryptedFileExt).AsUncIfLong()
        let outputFile = (conversion.DownloadFileName + R.DecryptedFileExt).AsUncIfLong()
        var operation Mp4Operation? = nil
        let AaxFileConversionProgressUpdate = async func (sender object, e ConversionProgressEventArgs) void {
            if cancToken.IsCancellationRequested {
                await (operation?.CancelAsync() ?? Task.CompletedTask)
            }
            progressAction(conversion, e.ProcessPosition)
        }
        try {
            if !File.Exists(inputFile) {
                return false
            }
            {
                using let ifStream = File.OpenRead(inputFile)
                aaxFile = AaxFile(ifStream)
                aaxFile.SetDecryptionKey(conversion.BookCommon!!.LicenseKey!!, conversion.BookCommon!!.LicenseIv!!)
                numChannels = aaxFile.AudioChannels
                {
                    using let fileStream = File.OpenWrite(outputFile)
                    operation = aaxFile.ConvertToMp4aAsync(fileStream)
                    operation.ConversionProgressUpdate += AaxFileConversionProgressUpdate
                    await operation
                    succ = operation.IsCompletedSuccessfully
                    if succ {
                        progressAction(
                            conversion,
                            TimeSpan.FromSeconds(conversion.BookMeta!!.RunTimeLengthSeconds ?? 0)
                        )
                    }
                }
            }
            if succ {
                BookLibrary.SavePersistentState(conversion, EConversionState.LocalUnlocked)
            } else {
                conversion.State = EConversionState.UnlockingFailed
            }
            Log(3, this, () -> "$conversion; decryption finished, succ=$succ.")
        } catch (exc Exception) {
            conversion.State = EConversionState.UnlockingFailed
            Log(1, this, () -> "$conversion; ${exc.Summary()}")
            return false
        }
        if succ && numChannels > 0 {
            try {
                let suffix = if numChannels == 1 {
                    "_Mono"
                } else {
                    "_Stereo"
                }
                Rename(inputFile, suffix)
                Rename(outputFile, suffix)
                BookLibrary.SaveFileNameSuffix(conversion, suffix)
            } catch (exc Exception) {
                Log(1, this, () -> "$conversion; ${exc.Summary()}")
            }
        }
        return succ
    }

    async func DownloadCoverImagesAsync() {
        using let logGuard = LogGuard(3, this)
        await BookLibrary.AddCoverImagesAsync((url string) -> HttpClientAmazon.DownloadImageAsync(url))
    }

    async func UpdateMetaInfo(components IEnumerable[Component], onDone(IEnumerable[Component]) -> void) {
        using let logGuard = LogGuard(3, this, () -> "#comp=${components.Count()}")
        let pairs = List[ProductComponentPair]()
        for comp in components {
            Log(3, this, () -> comp.Conversion!!.ToString())
            let prod Product? = await GetProductInfoAsync(comp.Asin!!)
            if prod == nil {
                continue
            }
            pairs.Add(ProductComponentPair(prod, comp))
        }
        BookLibrary.UpdateComponentProduct(pairs)
        let result = pairs.Select((p ProductComponentPair) -> p.Component).ToList()
        onDone(result)
    }

    async func GetProductInfoAsync(asin string) Product? {
        const GROUPS = "response_groups=contributors,media,product_attrs,product_desc,product_extended_attrs," +
            "product_plan_details,product_plans,rating,review_attrs,reviews,sample,sku"
        let url = "/1.0/catalog/products/" + asin + "?" + GROUPS
        let result string? = await CallAudibleApiSignedForStringAsync(url)
        if Logging.Level >= 3 {
            let file string? = result.WriteTempJsonFile("ProductResponse_$asin")
            Log(3, this, () -> "asin=$asin, file=\"${Path.GetFileName(file)}\"")
        }
        let productResponse ProductResponse? = ProductResponse.Deserialize(result)
        let product Product? = productResponse?.Product
        return product
    }

    func GetBooks() IEnumerable[Book] {
        return BookLibrary.GetBooks(ProfileId(AccountId, Region))
    }

    func SavePersistentState(conversion Conversion, state EConversionState) {
        BookLibrary.SavePersistentState(conversion, state)
    }

    func RestorePersistentState(conversion Conversion) {
        BookLibrary.RestorePersistentState(conversion)
    }

    func GetPersistentState(conversion Conversion) EConversionState {
        return BookLibrary.GetPersistentState(conversion)
    }

    func CheckUpdateFilesAndState(
        downloadSettings IDownloadSettings,
        exportSettings IExportSettings,
        callbackRefConversion(IConversion) -> void,
        interactCallback IInteractionCallback[InteractionMessage[BookLibInteract], bool?]
    ) {
        BookLibrary.CheckUpdateFilesAndState(
            ProfileId(AccountId, Region),
            downloadSettings,
            exportSettings,
            callbackRefConversion,
            interactCallback
        )
    }

    func VerifyCompletedDownloads(downloadSettings IDownloadSettings, exportSettings IExportSettings) int32 {
        return BookLibrary.VerifyCompletedDownloads(ProfileId(AccountId, Region), downloadSettings, exportSettings)
    }

    internal async func GetLibraryAsync(json string?, resync bool) LibraryResponse? {
        using let logGuard = LogGuard(3, this, () -> "resync=$resync")
        const PAGE_SIZE = 100
        var page = 0
        var libProducts = List[Product]()
        if json == nil {
            const GROUPS = "response_groups=badge_types,category_ladders,claim_code_url,contributors,is_downloaded,is_returnable,media," +
                "origin_asin,pdf_url,percent_complete,price,product_attrs,product_desc,product_extended_attrs,product_plan_details," +
                "product_plans,provided_review,rating,relationships,review_attrs,reviews,sample,series,sku"
            let dt = await BookLibrary.SinceLatestPurchaseDateAsync(ProfileId(AccountId, Region), resync)
            while true {
                page++
                let url = "/1.0/library" +
                    "?purchased_after=${dt.ToXmlTime()}" +
                    "&num_results=$PAGE_SIZE" +
                    "&page=$page" +
                    "&" +
                    GROUPS
                let pageResult string? = await CallAudibleApiSignedForStringAsync(url)
                if pageResult == nil {
                    return nil
                }
                if Logging.Level >= 3 {
                    let file string? = pageResult.WriteTempJsonFile("LibraryResponse")
                    Log(3, this, () -> "page=$page, file=\"${Path.GetFileName(file)}\"")
                }
                let libraryResponse LibraryResponse? = LibraryResponse.Deserialize(pageResult)
                if libraryResponse == nil {
                    return nil
                }
                if !(libraryResponse?.Items!!.Any() ?? false) {
                    break
                }
                let pageProducts = libraryResponse.Items
                Log(3, this, () -> "#items/page=${pageProducts!!.Length}")
                libProducts.AddRange(pageProducts!!)
            }
        } else {
            let libraryResponse LibraryResponse? = LibraryResponse.Deserialize(json)
            libProducts.AddRange(libraryResponse!!.Items!!)
        }
        libProducts = libProducts.DistinctBy((p Product) -> p.Asin).ToList()
        libProducts.Sort((x Product, y Product) -> DateTime.Compare(x.PurchaseDate, y.PurchaseDate))
        await BookLibrary.AddRemBooksAsync(libProducts, ProfileId(AccountId, Region), resync)
        let allPagesResponse = LibraryResponse()
        allPagesResponse.Items = libProducts.ToArray()
        return allPagesResponse
    }

    private func EnsureAccountId() {
        if accountId > 0 {
            return
        }
        let ctxt = Profile.GetAccountAliasContext(BookLibrary, GetAccountAliasFunc, false)
        accountId = ctxt.LocalId
        accountAlias = ctxt.Alias
    }

    private async func GetDownloadLicenseAsyncInternal(asin string, quality EDownloadQuality) string? {
        let url = "$ContentPath/$asin/licenserequest"
        let jsonBody = BuildLicenseRequestBody(quality)
        return await CallAudibleApiSignedForStringAsync(url, jsonBody, AddLicenseRequestHeaders)
    }

    // ponytail: the ADP transport hints the official client sends alongside the adp-token
    // signature. Cheap to send and they make the request look like the device it is signed as.
    // X-Device-Type-Id must stay in sync with AudibleLogin.DeviceType, which is what this app
    // actually registers as; sending another client's device type would create the very mismatch
    // these headers exist to avoid.
    private func AddLicenseRequestHeaders(request HttpRequestMessage) {
        request.Headers.TryAddWithoutValidation("X-Amzn-RequestId", Guid.NewGuid().ToString("N").ToUpperInvariant())
        request.Headers.TryAddWithoutValidation("X-ADP-SW", "37801821")
        request.Headers.TryAddWithoutValidation("X-ADP-Transport", "WIFI")
        request.Headers.TryAddWithoutValidation("X-ADP-LTO", "120")
        request.Headers.TryAddWithoutValidation("X-Device-Type-Id", AudibleLogin.DeviceType)
    }

    private func DecryptLicense(license ContentLicense?) {
        // See also
        // https://patchwork.ffmpeg.org/project/ffmpeg/patch/17559601585196510@sas2-2fa759678732.qloud-c.yandex.net/
        if license == nil {
            return
        }
        // A denied license is still returned as HTTP 200, but without the encrypted voucher.
        // Report why instead of failing later with an opaque exception.
        if string.IsNullOrEmpty(license.LicenseResponseText) {
            Log(1, this, () -> "asin=${license.Asin}; ${DescribeDenial(license)}")
            return
        }
        let hashable = Profile!!.DeviceInfo!!.Type +
            Profile!!.DeviceInfo!!.Serial +
            Profile!!.CustomerInfo!!.AccountId +
            license.Asin
        let hashableBytes = Encoding.ASCII.GetBytes(hashable)
        let key = [16]uint8
        let iv = [16]uint8
        using let sha256 = SHA256.Create()
        let hash = sha256.ComputeHash(hashableBytes)
        Array.Copy(hash, 0, key, 0, 16)
        Array.Copy(hash, 16, iv, 0, 16)
        let encryptedText = Convert.FromBase64String(license.LicenseResponseText)
        using let aes = Aes.Create()
        aes.Mode = CipherMode.CBC
        aes.Padding = PaddingMode.None
        using let decryptor = aes.CreateDecryptor(key, iv)
        using let csDecrypt = CryptoStream(MemoryStream(encryptedText), decryptor, CryptoStreamMode.Read)
        csDecrypt.ReadExactly(encryptedText, 0, encryptedText.Length & 0x7ffffff0)
        let plainText = Encoding.ASCII.GetString(encryptedText.TakeWhile((b uint8) -> b != uint8(0)).ToArray())
        let voucher Voucher? = Voucher.Deserialize(plainText)
        license.Voucher = voucher
    }

    private async func CallAudibleApiSignedForStringAsync(
        relUrl string,
        jsonBody string? = nil,
        decorate((HttpRequestMessage) -> void)? = nil
    ) string? {
        let request = MakeSignedRequest(relUrl, jsonBody, decorate)
        return await SendForStringAsync(request, HttpClientAudible)
    }

    private async func CallAudibleApiSignedForBytesAsync(relUrl string, jsonBody string? = nil)[]?uint8 {
        let request = MakeSignedRequest(relUrl, jsonBody, nil)
        return await SendForBytesAsync(request, HttpClientAudible)
    }

    private func MakeSignedRequest(
        relUrl string,
        jsonBody string?,
        decorate((HttpRequestMessage) -> void)? = nil
    ) HttpRequestMessage {
        let relUri = Uri(relUrl, UriKind.Relative)
        let method = if jsonBody == nil {
            HttpMethod.Get
        } else {
            HttpMethod.Post
        }
        let request = HttpRequestMessage(method, relUri)
        request.Headers.Add("Accept", "application/json")
        if jsonBody != nil {
            let content HttpContent = StringContent(jsonBody, Encoding.UTF8, "application/json")
            request.Content = content
        }
        // Decorate before signing for tidiness only: the signature covers method, URL, timestamp and
        // body, not headers, so extra headers cannot invalidate it.
        decorate?(request)
        SignRequest(request)
        return request
    }

    private async func SendForStringAsync(request HttpRequestMessage, httpClient HttpClientEx?) string? {
        var content string? = nil
        try {
            await request.LogAsync(
                4,
                this,
                httpClient!!.DefaultRequestHeaders,
                httpClient!!.CookieContainer,
                httpClient!!.BaseAddress
            )
            let response = await httpClient!!.SendAsync(request)
            await response.LogAsync(4, this, httpClient!!.CookieContainer, httpClient!!.BaseAddress)
            content = await response.Content.ReadAsStringAsync()
            if !response.IsSuccessStatusCode {
                Log(
                    1,
                    this,
                    () -> (
                        "API call failed: ${int32(response.StatusCode)} ${response.ReasonPhrase} " +
                            "URL=${request.RequestUri} Content=${(if content?.Length > 500 { content!![..500] } else { content })}"
                    )
                )
            }
            response.EnsureSuccessStatusCode()
            return content
        } catch (exc Exception) {
            Log(1, this, () -> "${exc.Summary()}${Environment.NewLine}$content")
            return nil
        }
    }

    private async func SendForBytesAsync(request HttpRequestMessage, httpClient HttpClientEx?)[]?uint8 {
        var response HttpResponseMessage? = nil
        try {
            await request.LogAsync(
                4,
                this,
                httpClient!!.DefaultRequestHeaders,
                httpClient!!.CookieContainer,
                httpClient!!.BaseAddress
            )
            response = await httpClient!!.SendAsync(request)
            await response.LogAsync(4, this, httpClient!!.CookieContainer, httpClient!!.BaseAddress)
            response.EnsureSuccessStatusCode()
            let content = await response.Content.ReadAsByteArrayAsync()
            return content
        } catch (exc Exception) {
            let content = await response!!.Content.ReadAsStringAsync()
            Log(1, this, () -> "${exc.Summary()}${Environment.NewLine}$content")
            return nil
        }
    }

    private func SignRequest(request HttpRequestMessage) {
        let signature = MakeRequestSignature(request)
        request.Headers.Add("x-adp-token", Profile!!.AdpToken)
        request.Headers.Add("x-adp-alg", "SHA256withRSA:1.0")
        request.Headers.Add("x-adp-signature", signature)
    }

    private func MakeRequestSignature(request HttpRequestMessage) string {
        let dt = DateTime.UtcNow
        let method = request.Method.ToString().ToUpper()
        let url = request.RequestUri!!.OriginalString
        let time = dt.ToXmlTime()
        let content string? = request.Content?.ReadAsStringAsync().Result
        let adpToken = Profile!!.AdpToken
        let dataString = ("$method" + `
` + "$url" + `
` + "$time" + `
` + "$content" + `
` + "$adpToken")
        let signBytes = Sign(dataString)
        let encoded = Convert.ToBase64String(signBytes)
        let signature = "$encoded:$time"
        return signature
    }

    private func Sign(dataString string)[]uint8 {
        let dataBytes = Encoding.UTF8.GetBytes(dataString)
        using let sha256Hash = SHA256.Create()
        let hashBytes = sha256Hash.ComputeHash(dataBytes)
        using let rsa = RSA.Create()
        ImportPrivateKey(rsa, Profile!!.PrivateKey)
        let signatureBytes = rsa.SignHash(hashBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)
        return signatureBytes
    }

    shared {
        // Kept consistent with the registered device type (AudibleLogin.DeviceType, an iPhone client):
        // a User-Agent that contradicts the registration is a mismatch Audible's router can detect.
        private const UserAgent string = "Audible/3.56.2 (iPhone; iOS 15.0.0; Scale/3.00)"

        // const string HTTP_AUTHORITY_AUDIBLE = @"https://api.audible.";
        private const ContentPath string = "/1.0/content"

        // Amazon's validationType for a rights check, as it appears in license_denial_reasons.
        private const OwnershipValidationType string = "Ownership"

        // Rejection reasons that mean "try again later" rather than "you lost access". Amazon reports
        // these under OwnershipValidationType, so matching on validation type alone reads a temporary
        // block as a permanent loss of rights.
        private let TransientRejectionReasons[]string = []string{"CustomerThrottled"}

        private func BuildLicenseRequestBody(quality EDownloadQuality) string {
            var json = (`{
        "consumption_type": "Download",
        "supported_drm_types": ["Mpeg", "Adrm"],
        "quality": "` + "$quality" + `",
        "response_groups": "last_position_heard,pdf_url,content_reference,chapter_info"
      }`)
            json = json.CompactJson()
            if !json.ValidateJson() {
                throw InvalidOperationException("invalid json")
            }
            return json
        }

        /// True when Audible refused the license because the customer has no rights to the title, as
        /// opposed to a transient or unrecognised failure. This is the signature of a title that left
        /// the library: returned, or shared via Amazon Household / Family Library and then withdrawn.
        /// A single transient reason vetoes the whole response: while Amazon is throttling it may fail
        /// to resolve the customer at all, and then every other validator reports against an identity
        /// it never established — including ownership.
        private func IsEntitlementDenial(license ContentLicense?) bool {
            let reasons[]?LicenseDenialReason = license!!.LicenseDenialReasons
            if reasons == nil {
                return false
            }
            if reasons.Any(
                (r LicenseDenialReason) -> TransientRejectionReasons.Contains(
                    r.RejectionReason,
                    StringComparer.OrdinalIgnoreCase
                )
            ) {
                return false
            }
            return reasons.Any(
                (r LicenseDenialReason) -> string.Equals(
                    r.ValidationType,
                    OwnershipValidationType,
                    StringComparison.OrdinalIgnoreCase
                )
            )
        }

        /// Short, actionable reason shown to the user. Entitlement denials get a plain explanation;
        /// anything else keeps the raw Amazon detail, since the cause is not understood well enough to
        /// summarise. The full detail is logged in both cases by (cref:DescribeDenialVerbose).
        private func DescribeDenial(license ContentLicense?) string -> if IsEntitlementDenial(license) {
            "no longer available in your library — Audible reports no ownership rights for this title. " +
                "It may have been returned, or shared access (Amazon Household / Family Library) withdrawn."
        } else {
            DescribeDenialVerbose(license)
        }

        private func DescribeDenialVerbose(license ContentLicense?) string {
            let sb = StringBuilder()
            sb.Append("license not granted, status=").Append(license!!.StatusCode ?? "(none)")
            if !license!!.Message.IsNullOrWhiteSpace() {
                sb.Append("; ").Append(license!!.Message)
            }
            for reason in license!!.LicenseDenialReasons ?? Array.Empty[LicenseDenialReason]() {
                sb.Append("; [${reason.ValidationType}/${reason.RejectionReason}] ${reason.Message}")
            }
            return sb.ToString()
        }

        private async func CopyStreams(
            conversion Conversion,
            rdr BufferedStream,
            wrtr BufferedStream,
            progressAction(Conversion, int64) -> void,
            cancToken CancellationToken
        ) int64 {
            const BUF_SIZE = 16384
            var accusize int64 = 0
            let buffer = [BUF_SIZE]uint8
            while true {
                if cancToken.IsCancellationRequested {
                    return -1
                }
                let size = await rdr.ReadAsync(buffer, 0, BUF_SIZE, cancToken)
                if size == 0 {
                    break
                }
                accusize += int64(size)
                progressAction(conversion, accusize)
                await wrtr.WriteAsync(buffer, 0, size, cancToken)
            }
            return accusize
        }

        /// Imports a private key that may be PEM-encoded (PKCS#1 or PKCS#8) or raw base64 DER.
        /// Amazon's registration response sends the key with PEM headers and escaped newlines.
        private func ImportPrivateKey(rsa RSA, privateKey string) {
            // First, try direct PEM import (works if the string has proper PEM headers and real newlines)
            try {
                rsa.ImportFromPem(privateKey)
                return
            } catch (ArgumentException) {
                // PEM import failed — key may have escaped newlines or be raw base64

            }
            // Strip PEM headers and normalize newlines
            let cleaned = privateKey
                .Replace("-----BEGIN RSA PRIVATE KEY-----", string.Empty)
                .Replace("-----END RSA PRIVATE KEY-----", string.Empty)
                .Replace("-----BEGIN PRIVATE KEY-----", string.Empty)
                .Replace("-----END PRIVATE KEY-----", string.Empty)
                .Replace("\\n", string.Empty)
                .Replace("\n", string.Empty)
                .Replace("\r", string.Empty)
                .Trim()
            let keyBytes = Convert.FromBase64String(cleaned)
            // Try PKCS#1 first (RSA PRIVATE KEY), then PKCS#8 (PRIVATE KEY)
            try {
                rsa.ImportRSAPrivateKey(keyBytes, out _)
            } catch (CryptographicException) {
                rsa.ImportPkcs8PrivateKey(keyBytes, out _)
            }
        }
    }
}
