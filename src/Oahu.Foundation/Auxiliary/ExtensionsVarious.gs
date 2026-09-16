package Oahu.Aux.Extensions

import Oahu.Aux
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text
import System.Text.Encodings.Web
import System.Text.Json
import System.Text.Json.Serialization
import System.Text.Json.Serialization.Metadata
import System.Xml

func (s string?) IsNullOrWhiteSpace() bool -> string.IsNullOrWhiteSpace(s)

func (s string) IsNullOrEmpty() bool -> string.IsNullOrEmpty(s)

func (e IEnumerable[T]?) IsNullOrEmpty[T]() bool -> e == nil || e.Count() == 0

func (o object?) IsNull() bool -> o == nil

func (items IEnumerable[T]) ForEach[T](action(T) -> void) {
    for item in items {
        action(item)
    }
}

class ExString {
    shared {
        const SEPARATOR string = "; "
        const ELLIPSIS char = '…'
        const MaxlenShortstring int32 = 40
        let InvalidFileNameChars[]char = Path.GetInvalidFileNameChars()
        let DoubtfulFileNameChars[]char = []char{
            '¡',
            '¢',
            '£',
            '¤',
            '¥',
            '¦',
            '§',
            '¨',
            '©',
            'ª',
            '«',
            '¬',
            '®',
            '¯',
            '°',
            '±',
            '²',
            '³',
            '´',
            'µ',
            '¶',
            '·',
            '¸',
            '¹',
            'º',
            '»',
            '¼',
            '½',
            '¾',
            '¿',
            '×',
            '÷',
            '‘',
            '’',
            'ƒ',
            '„',
            '…',
            '†',
            '‡',
            'ˆ',
            '‰',
            '‹',
            '‘',
            '“',
            '”',
            '•',
            '–',
            '—',
            '˜',
            '™',
            '›'
        }
    }
}

func (values IEnumerable[string]) FirstEtAl(separator char) string? -> values.FirstEtAlImpl("$separator ")

func (values IEnumerable[string]) FirstEtAl(separator string = "; ") string? -> values.FirstEtAlImpl(separator)

func (values IEnumerable[string]) Combine(separator char) string? -> values.CombineImpl(false, "$separator ")

func (values IEnumerable[string]) Combine(separator string = "; ") string? -> values.CombineImpl(false, separator)

func (values IEnumerable[string]) Combine(newLine bool) string? -> values.CombineImpl(newLine, ExString.SEPARATOR)

func (value string) SplitTrim(separator char)[]string -> value.SplitTrim([]char{separator})

func (value string) SplitTrim(separators[]?char = nil)[]string {
    var separators = separators
    if string.IsNullOrWhiteSpace(value) {
        return [0]string
    }
    if separators == nil {
        separators = []char{',', ';'}
    }
    var values = value.Split(separators)
    values = values.Select((v string) -> v.Trim()).ToArray()
    return values
}

func (s string?) Prune(invalid[]?char) string? {
    var invalid = invalid
    var doubtful[]?char = nil
    if s == nil {
        return nil
    }
    if invalid == nil {
        invalid = ExString.InvalidFileNameChars
        doubtful = ExString.DoubtfulFileNameChars
    }
    let sb = StringBuilder()
    for c in s {
        if invalid.Contains(c) {
            continue
        } else if doubtful?.Contains(c) ?? false {
            continue
        } else {
            sb.Append(c)
        }
    }
    return sb.ToString()
}

func (s string?) Prune() string? {
    if s == nil {
        return nil
    }
    var pruned string? = s.Prune(nil)
    pruned = pruned!!.Trim('.')
    return pruned
}

func (s string?) SubstitUser() string? {
    if s == nil {
        return nil
    }
    let userdir = ApplEnv.UserDirectoryRoot
    if !s.Contains(userdir) {
        return s
    }
    let userdir1 = userdir.Replace(ApplEnv.UserName, "USER")
    let s1 = s.Replace(userdir, userdir1)
    return s1
}

/// Performs the ROT13 character rotation.
func (value string) Rot13() string {
    const C = 13
    let array = value.ToCharArray()
    for var i = 0; i < array.Length; i++ {
        var number = int32(array[i])
        if number >= int32('a') && number <= int32('z') {
            if number > int32('m') {
                number -= C
            } else {
                number += C
            }
        } else if number >= int32('A') && number <= int32('Z') {
            if number > int32('M') {
                number -= C
            } else {
                number += C
            }
        }
        array[i] = char(number)
    }
    return String(array)
}

func (values IEnumerable[string]) FirstEtAlImpl(separator string) string? {
    if values.IsNullOrEmpty() {
        return nil
    }
    if values.Count() > 1 {
        return "${values.First()}$separator${ExString.ELLIPSIS}"
    } else {
        return values.First()
    }
}

func (values IEnumerable[string]?) CombineImpl(newLine bool, separator string) string? {
    if values == nil {
        return nil
    }
    let sb = StringBuilder()
    for v in values {
        if string.IsNullOrWhiteSpace(v) {
            continue
        }
        if sb.Length > 0 {
            sb.Append(separator)
            if newLine {
                sb.AppendLine()
            }
        }
        sb.Append(v)
    }
    return sb.ToString()
}

// TODO implement encoding param
func (s string) GetBytes(enc Encoding? = nil)[]uint8 -> Encoding.ASCII.GetBytes(s)

class JsonExtensions {
    shared {
        private let _options JsonSerializerOptions = JsonSerializerOptions{
            TypeInfoResolver: DefaultJsonTypeInfoResolver(),
            WriteIndented: true,
            ReadCommentHandling: JsonCommentHandling.Skip,
            AllowTrailingCommas: true,
            Converters: {JsonStringEnumConverter()},
            Encoder: JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            DefaultIgnoreCondition: JsonIgnoreCondition.WhenWritingNull
        }

        prop Options JsonSerializerOptions {
            get {
                return _options
            }
        }
    }
}

func (any object) SerializeToJsonAny() string? {
    try {
        let result = JsonSerializer.Serialize(any, any.GetType(), JsonExtensions.Options)
        return result
    } catch (Exception) {
        return nil
    }
}

func (json string) DeserializeJson[T]() T {
    try {
        let result = JsonSerializer.Deserialize[T](json, JsonExtensions.Options)
        return result
    } catch (Exception) {
        return default(T)
    }
}

func (date DateTime) RoundDown(span TimeSpan) DateTime {
    let ticks = date.Ticks / span.Ticks
    return DateTime(ticks * span.Ticks, date.Kind)
}

func (dt DateTime) ToXmlTime() string -> XmlConvert.ToString(dt, XmlDateTimeSerializationMode.Utc)

class ExUnc {
    shared {
        const UNC string = "UNC\\"
        const UncPfx string = "\\\\?\\"
        const UncNet string = UncPfx + UNC
    }
}

func (path string) IsUnc() bool {
    let root string? = Path.GetPathRoot(path)
    if root!!.StartsWith(ExUnc.UncPfx) {
        return true
    }
    return false
}

func (path string) AsUncIfLong() string {
    var path = path
    if path.IsUnc() {
        return path
    }
    path = Path.GetFullPath(path)
    if path.Length < 250 {
        return path
    }
    return path.AsUnc()
}

func (path string) AsUnc() string {
    if path.IsUnc() {
        return path
    } else {
        let root string? = Path.GetPathRoot(path)
        if root!!.StartsWith("\\\\") {
            let s = path.Substring(2)
            return ExUnc.UncNet + s
        } else {
            return ExUnc.UncPfx + path
        }
    }
}

func (ba[]?uint8) BytesToHexString() string? {
    if ba == nil {
        return nil
    }
    return BitConverter.ToString(ba).Replace("-", "").ToLower()
}

class ExFile {
    shared {
        let OneMs TimeSpan = TimeSpan.FromMilliseconds(1)
    }
}

func (path string) GetUniqueTimeBasedFilename(alwaysUseSpaceSep bool = false) string {
    const SPC = ' '
    const DSH = '-'
    let dir string? = Path.GetDirectoryName(path)
    let filnamstub = Path.GetFileNameWithoutExtension(path)
    let ext = Path.GetExtension(path)
    let c = if (alwaysUseSpaceSep || filnamstub.Contains(SPC)) {
        SPC
    } else {
        DSH
    }
    let fmt1 = "${c}yyyy_MM_dd${c}HH_mm_ss"
    let fmt2 = "${fmt1}_fff"
    var fmt = fmt1
    var result string
    var timestamp = DateTime.Now
    while true {
        let sTimestamp = timestamp.ToString(fmt)
        result = Path.Combine(dir!!, filnamstub + sTimestamp + ext)
        if !File.Exists(result) {
            break
        }
        timestamp += ExFile.OneMs
        fmt = fmt2
    }
    return result
}

func (bytes[]uint8) ToBase64StringTrimmed() string -> bytes.ToBase64String().TrimBase64String()

func (bytes[]uint8) ToBase64String() string -> Convert.ToBase64String(bytes)

func (bytes[]uint8) ToUrlBase64String() string -> bytes.ToBase64StringTrimmed().Replace('+', '-').Replace('/', '_')

func (s string) TrimBase64String() string -> s.TrimEnd('=')

func (s string) FromBase64String()[]?uint8 {
    var s = s
    s = s.Trim()
    let n = s.Length % 4
    let padded = switch n {
        case 2: s + "=="
        case 3: s + "="
        default: s
    }
    try {
        return Convert.FromBase64String(padded)
    } catch (Exception) {
        return nil
    }
}

class ExImage {
    shared {
        let JpegHeader[]uint8 = []uint8{0xFF, 0xD8, 0xFF}
        let PngHeader[]uint8 = []uint8{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
        let GifHeader[]uint8 = []uint8{0x47, 0x49, 0x46}
        let BmpHeader[]uint8 = []uint8{0x42, 0x4D}
        let TiffLe[]uint8 = []uint8{0x49, 0x49, 0x2A, 0x00}
        let TiffBe[]uint8 = []uint8{0x4D, 0x4D, 0x00, 0x2A}

        func StartsWith(data[]?uint8, signature[]uint8) bool {
            if data!!.Length < signature.Length {
                return false
            }
            for var i = 0; i < signature.Length; i++ {
                if (data!![i] != signature[i]) {
                    return false
                }
            }
            return true
        }
    }
}

func (bytes[]?uint8) FindImageFormat() string? {
    if bytes == nil || bytes.Length < 8 {
        return nil
    }
    try {
        if ExImage.StartsWith(bytes, ExImage.JpegHeader) {
            return ".jpg"
        }
        if ExImage.StartsWith(bytes, ExImage.PngHeader) {
            return ".png"
        }
        if ExImage.StartsWith(bytes, ExImage.GifHeader) {
            return ".gif"
        }
        if ExImage.StartsWith(bytes, ExImage.BmpHeader) {
            return ".bmp"
        }
        if ExImage.StartsWith(bytes, ExImage.TiffLe) || ExImage.StartsWith(bytes, ExImage.TiffBe) {
            return ".tif"
        }
        return nil
    } catch (Exception) {
        return nil
    }
}

func (exc Exception) Summary(
    withCRLF bool = false
) string -> "${exc.GetType().Name}:${(if withCRLF { Environment.NewLine } else { " " })}\"${exc.Message.SubstitUser()}\""

func (type Type?) PrettyName(level int32? = nil, fullName bool = false) string? {
    let TypeName = func () string? {
        return if fullName {
            type!!.FullName
        } else {
            type!!.Name
        }
    }
    let nargs = type!!.GetGenericArguments().Length
    if nargs == 0 || ((level != nil) && nargs > level!!) {
        return TypeName()
    }
    let genericArguments = type!!.GetGenericArguments()
    let typeDefinition = type!!.Name
    let idx = typeDefinition.IndexOf("`")
    if idx < 0 {
        return TypeName()
    }
    let unmangledName = typeDefinition.Substring(0, idx)
    return unmangledName + "<${string.Join(",", genericArguments.Select((t Type) -> t.PrettyName(1)))}>"
}
