package Oahu.Decrypt

import Oahu.Decrypt.Mpeg4
import System.IO

interface INewSplitCallback {
    prop Chapter Chapter {
        get;
    }

    prop TrackNumber int32?
    prop TrackCount int32?
    prop TrackTitle string?
    prop OutputFile Stream?
}

interface INewSplitCallback[T INewSplitCallback[T]] : Oahu.Decrypt.INewSplitCallback {
    shared{func Create(chapter Chapter) T;}
}

class NewSplitCallback : Oahu.Decrypt.INewSplitCallback[NewSplitCallback] {
    private init(chapter Chapter) {
        Chapter = chapter
    }

    prop Chapter Chapter {
        get;
        init;
    }

    prop TrackNumber int32?
    prop TrackCount int32?
    prop TrackTitle string?
    prop OutputFile Stream?

    shared {
        func Create(chapter Chapter) NewSplitCallback {
            return NewSplitCallback(chapter)
        }
    }
}
