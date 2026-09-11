package Oahu.Decrypt.Mpeg4.Boxes

import Oahu.Decrypt.Mpeg4
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text

open class AppleListBox : Box {
    init(file Stream, header BoxHeader, parent IBox?) : base(header, parent) {
        let endPos = Header.FilePosition + Header.TotalBoxSize
        while file.Position < endPos {
            let tagBoxHeader = BoxHeader(file)
            let appleTag = if tagBoxHeader.Type == "----" {
                cast[AppleTagBox](FreeformTagBox(file, tagBoxHeader, this))
            } else {
                AppleTagBox(file, tagBoxHeader, this)
            }
            if appleTag.Header.TotalBoxSize == int64(0) {
                break
            }
            Children.Add(appleTag)
        }
    }

    private init(parent IBox) : base(BoxHeader(8, "ilst"), parent) { }

    prop TagNames IEnumerable[string] -> Tags.Select((t AppleTagBox) -> t.Header.Type)
    prop FreeformTagNames IEnumerable[string] -> FreeformTags.Select((t FreeformTagBox) -> t.TagName)
    prop Tags IEnumerable[AppleTagBox] -> GetChildren[AppleTagBox]()
    prop FreeformTags IEnumerable[FreeformTagBox] -> GetChildren[FreeformTagBox]()

    func AddTag(name string, data string) {
        AppleTagBox.Create(this, name, Encoding.UTF8.GetBytes(data), AppleDataType.Utf_8)
    }

    func AddTag(name string, data[]uint8, type AppleDataType) {
        AppleTagBox.Create(this, name, data, type)
    }

    func RemoveTag(name string) bool -> GetTagBox(name) is {} tag && RemoveTag(tag)

    func RemoveFreeformTag(domain string, name string) bool -> GetFreeformTagBox(domain, name) is {} tag &&
        RemoveTag(tag)

    func RemoveTag(tag AppleTagBox) bool {
        if Children.Remove(tag) {
            tag.Dispose()
            return true
        } else if tag is FreeformTagBox ffTag {
            if ffTag
                .Mean
                ?.ReverseDnsDomain is {} domain &&
                ffTag
                .Name
                ?.Name is {} name &&
                GetFreeformTagBox(domain, name) is {} f &&
                Children.Remove(f) {
                f.Dispose()
                return true
            }
        } else if GetTagBox(tag.Header.Type) is {} t && Children.Remove(t) {
            t.Dispose()
            return true
        }
        return false
    }

    func EditOrAddTag(name string, data string?) {
        EditOrAddTag(
            name,
            if data == nil {
                default([]?uint8)
            } else {
                Encoding.UTF8.GetBytes(data)
            },
            AppleDataType.Utf_8
        )
    }

    func EditOrAddTag(name string, data[]?uint8) {
        EditOrAddTag(name, data, AppleDataType.ContainsData)
    }

    func EditOrAddTag[TData IAppleData[TData]](name string, data TData?) {
        var bytes[]?uint8
        if data != nil {
            bytes = [TData.SizeInBytes]uint8
            data.Write(bytes)
        } else {
            bytes = nil
        }
        EditOrAddTag(name, bytes, AppleDataType.ContainsData)
    }

    func EditOrAddTag(name string, data[]?uint8, type AppleDataType) {
        if GetTagBox(name) is {} tagBox {
            EditExistingTag(tagBox, data, type)
        } else if data != nil {
            AddTag(name, data, type)
        }
    }

    func AddFreeformTag(domain string, name string, data string) {
        FreeformTagBox.Create(this, domain, name, Encoding.UTF8.GetBytes(data), AppleDataType.Utf_8)
    }

    func AddFreeformTag(domain string, name string, data[]uint8, type AppleDataType) {
        FreeformTagBox.Create(this, domain, name, data, type)
    }

    func EditOrAddFreeformTag(domain string, name string, data string?) {
        EditOrAddFreeformTag(
            domain,
            name,
            if data == nil {
                default([]?uint8)
            } else {
                Encoding.UTF8.GetBytes(data)
            },
            AppleDataType.Utf_8
        )
    }

    func EditOrAddFreeformTag(domain string, name string, data[]?uint8) {
        EditOrAddFreeformTag(domain, name, data, AppleDataType.ContainsData)
    }

    func EditOrAddFreeformTag(domain string, name string, data[]?uint8, type AppleDataType) {
        if GetFreeformTagBox(domain, name) is {} tagBox {
            EditExistingTag(tagBox, data, type)
        } else if data != nil {
            AddFreeformTag(domain, name, data, type)
        }
    }

    func GetTagString(name string) string? -> GetTagString(GetTagBox(name))

    func GetFreeformTagString(domain string, name string) string? -> GetTagString(GetFreeformTagBox(domain, name))

    func GetTagData[TData IAppleData[TData]](name string) TData? -> if GetTagBox(name)?.Data is not{} dataBox {
        default(TData?)
    } else {
        (
            if dataBox.DataType != AppleDataType.ContainsData {
                throw InvalidDataException("Apple data type ${dataBox.DataType} is not compatible with ${"IAppleData"}")
                default(TData)
            } else {
                (
                    if dataBox.Data.Length != TData.SizeInBytes {
                        throw InvalidDataException(
                            "Tag data size (${dataBox.Data.Length}) differs from ${"IAppleData"} size (${TData.SizeInBytes})"
                        )
                        default(TData)
                    } else {
                        TData.Create(dataBox.Data)
                    }
                )
            }
        )
    }

    func GetTagBox(name string) AppleTagBox? -> Tags.FirstOrDefault((t AppleTagBox) -> t.Header.Type == name)

    func GetFreeformTagBox(domain string, name string) AppleTagBox? -> Tags.OfType[FreeformTagBox]().FirstOrDefault(
        (t FreeformTagBox) -> t.Mean?.ReverseDnsDomain == domain && t.Name?.Name == name
    )

    protected open override func Render(file Stream) { }

    private func EditExistingTag(tagBox AppleTagBox, data[]?uint8, type AppleDataType) {
        if data == nil {
            RemoveTag(tagBox)
        } else {
            let dataBox = tagBox.GetChildOrThrow[AppleDataBox]()
            dataBox.Data = if dataBox.DataType == type {
                data
            } else {
                throw InvalidDataException(
                    "Existing tag data type ${dataBox.DataType} differs from new edited type $type"
                )
                default([]uint8)
            }
        }
    }

    shared {
        func CreateEmpty(parent IBox) AppleListBox {
            let ilist = AppleListBox(parent)
            parent.Children.Add(ilist)
            return ilist
        }

        private func GetTagString(tagBox AppleTagBox?) string? -> if tagBox?.Data is not{} dataBox {
            default(string?)
        } else {
            (
                switch dataBox.DataType {
                    case AppleDataType.Utf_8: Encoding.UTF8.GetString(dataBox.Data)
                    case AppleDataType.Utf_16: Encoding.Unicode.GetString(dataBox.Data)
                    default: throw InvalidDataException("Apple data type ${dataBox.DataType} is not a string type")
                }
            )
        }
    }
}
