package Oahu.BooksDatabase.Ex

import Oahu.BooksDatabase
import System.Linq

func (book Book) ApplicableState(multipart bool) EConversionState {
    if multipart && book.Components!!.Count > 0 {
        let state = book.Components!!.Select((c Component) -> c.Conversion.ApplicableState()).Distinct().Min()
        return state
    } else {
        return book.Conversion.ApplicableState()
    }
}

func (conv Conversion?) ApplicableState() EConversionState {
    if conv!!.State == EConversionState.Download && (conv!!.PersistState != nil) {
        return conv!!.PersistState!!
    } else {
        return conv!!.State
    }
}

func (book Book) ApplicableDownloadQuality(multipart bool) EDownloadQuality {
    if multipart && book.Components!!.Count > 0 {
        let dnldqual = book.Components!!.Select((c Component) -> c.ApplicableDownloadQuality()).Distinct().Min()
        return dnldqual
    } else {
        return book.ApplicableDownloadQuality()
    }
}

func (book IBookCommon) ApplicableDownloadQuality() EDownloadQuality -> book.DownloadQuality ?? EDownloadQuality.Extreme

func (common IBookCommon) GetBook() Book? {
    return switch common {
        case book is Book: book
        case comp is Component: comp.Book
        case conv is Conversion: conv.ParentBook
        default: default(Book?)
    }
}
