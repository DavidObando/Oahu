package Oahu.Core

import System
import System.Text.Json.Serialization

enum EInitialSorting {
    StateDate,
    Date,
    AuthorTitle,
    AuthorDate,
    TitleAuthor
}

enum EBookLibInteract {
    None,
    CheckFile
}

enum EAuthorizeResult {
    None,
    InvalidUrl,
    AuthorizationFailed,
    RegistrationFailed,
    RemoveFailed,
    Succ,
    DeregistrationFailed,
    RemoveProfileFailed
}

@Flags
internal enum ECheckFile {
    None,
    DeleteIfMissing,
    Relocatable
}
