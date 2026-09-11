package Oahu.Decrypt.Mpeg4.Boxes

import System.Diagnostics
import System.IO

class BoxFactory {
    shared {
        func CreateBox[T Box](file Stream, parent IBox?) T {
            let box = CreateBox(file, parent)
            return box as T ?? throw InvalidDataException("The ${box.Header.Type} box is not of type ${typeof(T)}")
        }

        func CreateBox(file Stream, parent IBox?) IBox -> CreateBox(BoxHeader(file), file, parent)

        func CreateBox(header BoxHeader, file Stream, parent IBox?) IBox {
            let box IBox = switch header.Type {
                case "free" or "skip": cast[IBox](FreeBox(file, header, parent))
                case "ftyp": cast[IBox](FtypBox(file, header))
                case "mdat": cast[IBox](MdatBox(header))
                case "moov": cast[IBox](MoovBox(file, header))
                case "moof": cast[IBox](MoofBox(file, header))
                case "mvhd": cast[IBox](MvhdBox(file, header, parent))
                case "trak": cast[IBox](TrakBox(file, header, parent))
                case "tkhd": cast[IBox](TkhdBox(file, header, parent))
                case "mdia": cast[IBox](MdiaBox(file, header, parent))
                case "minf": cast[IBox](MinfBox(file, header, parent))
                case "mdhd": cast[IBox](MdhdBox(file, header, parent))
                case "hdlr": cast[IBox](HdlrBox(file, header, parent))
                case "stbl": cast[IBox](StblBox(file, header, parent))
                case "stsd": cast[IBox](StsdBox(file, header, parent))
                case "esds": cast[IBox](EsdsBox(file, header, parent))
                case "btrt": cast[IBox](BtrtBox(file, header, parent))
                case "adrm": cast[IBox](AdrmBox(file, header, parent))
                case "stts": cast[IBox](SttsBox(file, header, parent))
                case "stsc": cast[IBox](StscBox(file, header, parent))
                case "stsz": cast[IBox](StszBox(file, header, parent))
                case "stz2": cast[IBox](Stz2Box(file, header, parent))
                case "stco": cast[IBox](StcoBox(file, header, parent))
                case "co64": cast[IBox](Co64Box(file, header, parent))
                case "udta": cast[IBox](UdtaBox(file, header, parent))
                case "meta": cast[IBox](MetaBox(file, header, parent))
                case "ilst": cast[IBox](AppleListBox(file, header, parent))
                case "data": cast[IBox](AppleDataBox(file, header, parent))
                case "mean": cast[IBox](MeanBox(file, header, parent))
                case "name": cast[IBox](NameBox(file, header, parent))
                case "pssh": cast[IBox](PsshBox(file, header, parent))
                case "sidx": cast[IBox](SidxBox(file, header, parent))
                case "mfhd": cast[IBox](MfhdBox(file, header, parent))
                case "tfhd": cast[IBox](TfhdBox(file, header, parent))
                case "traf": cast[IBox](TrafBox(file, header, parent))
                case "tfdt": cast[IBox](TfdtBox(file, header, parent))
                case "trun": cast[IBox](TrunBox(file, header, parent))
                case "saiz": cast[IBox](SaizBox(file, header, parent))
                case "saio": cast[IBox](SaioBox(file, header, parent))
                case "schm": cast[IBox](SchmBox(file, header, parent))
                case "frma": cast[IBox](FrmaBox(file, header, parent))
                case "tenc": cast[IBox](TencBox(file, header, parent))
                case "schi": cast[IBox](SchiBox(file, header, parent))
                case "sinf": cast[IBox](SinfBox(file, header, parent))
                case "senc": cast[IBox](SencBox(file, header, parent))
                case "mvex": cast[IBox](MvexBox(file, header, parent))
                case "mehd": cast[IBox](MehdBox(file, header, parent))
                case "dec3": cast[IBox](Dec3Box(file, header, parent))
                case "tref": cast[IBox](TrefBox(file, header, parent))
                case "dac4": cast[IBox](Dac4Box(file, header, parent))
                default: cast[IBox](UnknownBox(file, header, parent))
            }
            Debug.Assert(box.RenderSize == header.TotalBoxSize || box is MdatBox)
            return box
        }
    }
}
