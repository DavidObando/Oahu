package Oahu.Core.Ex

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Net
import System.Net.Http
import System.Net.Http.Headers
import System.Text
import System.Text.Encodings.Web
import System.Text.Json
import System.Text.RegularExpressions
import System.Threading.Tasks
import System.Web
import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.BooksDatabase
import Oahu.Aux.ApplEnv
import R = Oahu.Core.Properties.Resources
import Oahu.Core

func (json string) CompactJson() string -> Regex.Replace(json, "(\"(?:[^\"\\\\]|\\\\.)*\")|\\s+", "$$1")

func (json string?) ValidateJson() bool {
    if json == nil {
        return false
    }
    try {
        let jsonValue = JsonDocument.Parse(json)
    } catch (Exception) {
        return false
    }
    return true
}

class JsonExtractor {
    shared {
        private let _writerOptions JsonWriterOptions = JsonWriterOptions{
            Indented: true,
            Encoder: JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        }

        prop WriterOptions JsonWriterOptions {
            get {
                return _writerOptions
            }
        }

        func ParseElem(key string?, jElem JsonElement, wr Utf8JsonWriter) {
            switch jElem.ValueKind {
                case JsonValueKind.Object {
                    ParseObject(key, jElem, wr)
                }
                case JsonValueKind.Array {
                    ParseArray(key, jElem, wr)
                }
                case JsonValueKind.String {
                    ParseString(key, jElem, wr)
                }
                case JsonValueKind.Null {
                    wr.WriteNull(key!!)
                }
                case JsonValueKind.Number {
                    {
                        let val = jElem.GetDouble()
                        wr.WriteNumber(key!!, val)
                    }
                }
                case JsonValueKind.False, JsonValueKind.True {
                    {
                        let val = jElem.GetBoolean()
                        wr.WriteBoolean(key!!, val)
                    }
                }
                default {
                    let _ = 0
                }
            }
        }

        func ParseObject(key string?, jElem JsonElement, wr Utf8JsonWriter) {
            let props IEnumerable[JsonProperty] = jElem.EnumerateObject()
            if key == nil {
                wr.WriteStartObject()
            } else {
                wr.WriteStartObject(key)
            }
            for prop in props {
                ParseElem(prop.Name, prop.Value, wr)
            }
            wr.WriteEndObject()
        }

        func ParseArray(key string?, jElem JsonElement, wr Utf8JsonWriter) {
            let elems IEnumerable[JsonElement] = jElem.EnumerateArray()
            if key == nil {
                wr.WriteStartArray()
            } else {
                wr.WriteStartArray(key)
            }
            for elem in elems {
                ParseElem(nil, elem, wr)
            }
            wr.WriteEndArray()
        }

        func ParseString(key string?, jElem JsonElement, wr Utf8JsonWriter) {
            let value string? = jElem.GetString()
            let newValue = "string ${value!!.Length} chars"
            wr.WriteString(key!!, newValue)
        }
    }
}

func (json string) ExtractJsonStructure() string? {
    try {
        let jDoc = JsonDocument.Parse(json)
        let jElem = jDoc.RootElement
        {
            using let msm = MemoryStream()
            {
                using let wr = Utf8JsonWriter(msm, JsonExtractor.WriterOptions)
                JsonExtractor.ParseElem(nil, jElem, wr)
                wr.Flush()
                let extracted = Encoding.UTF8.GetString(msm.ToArray())
                return extracted
            }
        }
    } catch (exc Exception) {
        Logging.Log(1, typeof(JsonExtractor), () -> exc.Summary())
        return nil
    }
}

class FileExtensions {
    shared {
        const JSON string = ".json"
        const HTML string = ".html"
        const TXT string = ".txt"

        async func ReadJsonFileAsync[T](directory string, filenameStub string) T {
            var filenameStub = filenameStub
            if filenameStub.IsNullOrWhiteSpace() {
                filenameStub = typeof(T).Name
            }
            var ext = Path.GetExtension(filenameStub)
            if ext.IsNullOrWhiteSpace() {
                ext = JSON
            }
            let filename = Path.GetFileNameWithoutExtension(filenameStub) + ext
            let path = Path.Combine(directory, filename)
            return await ReadJsonFileAsync[T](path)
        }

        async func ReadJsonFileAsync[T](path string) T {
            var path = path
            if !File.Exists(path) {
                let filename = typeof(T).Name + JSON
                path = Path.Combine(path, filename)
                if !File.Exists(path) {
                    return default(T)
                }
            }
            try {
                let json = await File.ReadAllTextAsync(path)
                if json.IsNullOrWhiteSpace() {
                    return default(T)
                }
                let result = json.DeserializeJson[T]()
                return result
            } catch (Exception) {
                return default(T)
            }
        }

        async func WriteTextFileAsync(text string?, dir string, filename string?, ext string, unique bool) string {
            if !dir.IsNullOrWhiteSpace() {
                Directory.CreateDirectory(dir)
            }
            let path = MakePathName(dir, filename, ext, unique)
            await File.WriteAllTextAsync(path, text)
            return path
        }

        func WriteTempTextFile(text string?, filename string?, ext string) string {
            let path = MakePathName(nil, filename, ext, true)
            Directory.CreateDirectory(TempDirectory)
            File.WriteAllText(path, text)
            return path
        }

        func MakePathName(dir string?, filename string?, ext string?, unique bool) string {
            var dir = dir
            var filename = filename
            var ext = ext
            if dir.IsNullOrWhiteSpace() {
                dir = ApplEnv.TempDirectory
            }
            if filename.IsNullOrWhiteSpace() {
                filename = ApplEnv.ApplName
            } else {
                let fext string? = Path.GetExtension(filename)
                if ext.IsNullOrWhiteSpace() {
                    ext = fext
                }
                filename = Path.GetFileNameWithoutExtension(filename)
            }
            if ext.IsNullOrWhiteSpace() {
                ext = TXT
            }
            if !ext!!.StartsWith('.') {
                ext = '.' + ext
            }
            let path = Path.Combine(dir!!, filename + ext)
            if unique {
                return path.GetUniqueTimeBasedFilename()
            } else {
                return path
            }
        }
    }
}

func (html string?) WriteTempHtmlFile(filenameStub string? = nil) string? {
    const DOC_HTML = "<!doctype html>"
    if !html!!.Contains(DOC_HTML, StringComparison.InvariantCultureIgnoreCase) {
        return nil
    }
    return FileExtensions.WriteTempTextFile(html, filenameStub, FileExtensions.HTML)
}

func (json string?) WriteTempJsonFile(filenameStub string? = nil) string? {
    if !json.ValidateJson() {
        return nil
    }
    return FileExtensions.WriteTempTextFile(json, filenameStub, FileExtensions.JSON)
}

func (text string) WriteTempTextFile(filenameStub string? = nil) string {
    return FileExtensions.WriteTempTextFile(text, filenameStub, FileExtensions.TXT)
}

async func (any object) WriteJsonFileAsync(directory string, filenameStub string? = nil, unique bool = false) string? {
    var filenameStub = filenameStub
    let json string? = any.SerializeToJsonAny()
    if json == nil {
        return nil
    }
    if filenameStub.IsNullOrWhiteSpace() {
        filenameStub = any.GetType().Name
    }
    return await FileExtensions.WriteTextFileAsync(json, directory, filenameStub, FileExtensions.JSON, unique)
}

async func (httpClient HttpClient?) DownloadImageAsync(url string)[]?uint8 -> await httpClient.DownloadImageAsync(
    Uri(url)
)

async func (httpClient HttpClient?) DownloadImageAsync(uri Uri)[]?uint8 {
    try {
        {
            using let networkStream = await httpClient!!.GetStreamAsync(uri)
            {
                using let memStream = MemoryStream()
                await networkStream.CopyToAsync(memStream)
                let image = memStream.ToArray()
                return image
            }
        }
    } catch (Exception) {
        return default([]uint8)
    }
}

func (response HttpResponseMessage?) HeadersToString() string? -> response?.Headers.HeadersToString()

func (request HttpRequestMessage?) HeadersToString() string? -> request?.Headers.HeadersToString()

func (headers HttpHeaders?) HeadersToString() string? {
    if headers == nil {
        return nil
    }
    let sb = StringBuilder()
    sb.Append("${headers.GetType().Name}:")
    let enumerator = headers.GetEnumerator()
    while enumerator.MoveNext() {
        let kvp = enumerator.Current
        for val in kvp.Value {
            sb.Append("${Environment.NewLine}  ${kvp.Key} = $val")
        }
    }
    return sb.ToString()
}

func (headers HttpHeaders?) IsNullOrEmpty() bool {
    if headers == nil {
        return true
    }
    let enumerator = headers.GetEnumerator()
    let isNotEmpty = enumerator.MoveNext()
    enumerator.Dispose()
    return !isNotEmpty
}

func (cookieContainer CookieContainer?) CookiesToString(uri Uri?) string? {
    if cookieContainer == nil || uri == nil {
        return nil
    }
    let cookies CookieCollection? = cookieContainer.GetCookies(uri)
    if cookies == nil {
        return nil
    }
    let sb = StringBuilder()
    sb.Append("${cookies.GetType().Name}:")
    for var i = 0;
    i < cookies.Count;
    i++ {
        let cookie = cookies[i]
        sb.Append("${Environment.NewLine}  ${cookie.Name} = ${cookie.Value}")
    }
    return sb.ToString()
}

async func (request HttpRequestMessage) ContentToStringAsync(creds Credentials? = nil) string? -> await request
    .Content
    .ContentToStringAsync(creds)

async func (content HttpContent?) ContentToStringAsync(creds Credentials? = nil) string? {
    if !(content is FormUrlEncodedContent) {
        return nil
    }
    let reqContentString = await content.ReadAsStringAsync()
    let nvc = HttpUtility.ParseQueryString(reqContentString)
    let sb = StringBuilder()
    sb.Append("${content.GetType().Name}:")
    for var i = 0;
    i < nvc.Count;
    i++ {
        let key string? = nvc.GetKey(i)
        let values[]?string = nvc.GetValues(i)
        for val in values!! {
            sb.Append("${Environment.NewLine}  $key = ${val.AnonymizeCredentials(creds)}")
        }
    }
    return sb.ToString()
}

internal func (profile IProfile?) GetAccountAlias(
    bookLibrary BookLibrary,
    getAccountAliasFunc((AccountAliasContext) -> bool)?,
    newAlias bool = false
) string? {
    let ctxt = profile.GetAccountAliasContext(bookLibrary, getAccountAliasFunc, newAlias)
    return ctxt.Alias ?? ctxt.CustomerName
}

internal func (profile IProfile?) GetAccountAliasContext(
    bookLibrary BookLibrary,
    getAccountAliasFunc((AccountAliasContext) -> bool)?,
    newAlias bool
) AccountAliasContext {
    let ctxt = bookLibrary.GetAccountId(profile, newAlias)
    if (ctxt.Alias.IsNullOrWhiteSpace() || newAlias) && getAccountAliasFunc != nil {
        getAccountAliasFunc(ctxt)
        bookLibrary.SetAccountAlias(ctxt)
    }
    return ctxt
}

internal func (profile IProfile?) CreateAliasKey(
    bookLibrary BookLibrary,
    getAccountAliasFunc((AccountAliasContext) -> bool)?
) IProfileAliasKey? {
    let alias string? = profile.GetAccountAlias(bookLibrary, getAccountAliasFunc)
    if alias.IsNullOrWhiteSpace() {
        return nil
    }
    return ProfileAliasKey(profile!!.Region, alias)
}

internal func (profile IProfile?) CreateKey() IProfileKey -> ProfileKey(
    profile!!.Id,
    profile!!.Region,
    profile!!.CustomerInfo?.AccountId
)

internal func (profile IProfile?) CreateKeyEx() IProfileKeyEx -> ProfileKeyEx(
    profile!!.Id,
    profile!!.Region,
    profile!!.CustomerInfo?.Name,
    profile!!.CustomerInfo?.AccountId,
    profile!!.DeviceInfo?.Name
)

internal func (profile IProfile?) Matches(key IProfileKey?) bool {
    if profile == nil || key == nil {
        return false
    }
    return profile.Region == key.Region && string.Equals(profile.CustomerInfo!!.AccountId, key.AccountId)
}

internal func (profile IProfile?) Matches(other IProfile?) bool {
    if profile == nil || other == nil {
        return false
    }
    if object.Equals(profile, other) {
        return true
    }
    return profile.Region == other.Region && string.Equals(
        profile.CustomerInfo!!.AccountId,
        other.CustomerInfo!!.AccountId
    )
}

internal func (profile ProfileBundle?) MatchesId(key IProfileKey) bool -> (profile?.Profile).MatchesId(key)

internal func (profile IProfile?) MatchesId(key IProfileKey?) bool {
    if profile == nil || key == nil {
        return false
    }
    return profile.Id == key.Id
}

internal func (parameters IEnumerable[KeyValuePair[string, string]]) ToQueryString() string -> string.Join(
    "&",
    parameters.Select((x KeyValuePair[string, string]) -> "${x.Key.UrlEncode()}=${x.Value.UrlEncode()}")
)

internal func (value string) UrlEncode() string -> WebUtility.UrlEncode(value)

internal func (other IConversion?) Copy() Conversion? {
    if other == nil {
        return nil
    }
    return Conversion(other.Id){
        State = other.State,
        DownloadFileName = other.DownloadFileName!!,
        DestDirectory = other.DestDirectory!!
    }
}

internal class DownloadFilenameExtensions {
    shared {
        let KnownExtensions[]string = []string{R.EncryptedFileExt, R.DecryptedFileExt, R.ExportedFileExt}
    }
}

func (downloadFileName string?) GetDownloadFileNameWithoutExtension() string? {
    let ext = Path.GetExtension(downloadFileName)!!.ToLower()
    if DownloadFilenameExtensions.KnownExtensions.Contains(ext) {
        return Path.GetFileNameWithoutExtension(downloadFileName)
    } else {
        return Path.GetFileName(downloadFileName)
    }
}
