using System;
using System.Text.Json.Serialization;

namespace Oahu.Core
{
  public enum EInitialSorting
  {
    [JsonStringEnumMemberName("state_date")]
    StateDate,
    [JsonStringEnumMemberName("date")]
    Date,
    [JsonStringEnumMemberName("author_title")]
    AuthorTitle,
    [JsonStringEnumMemberName("author_date")]
    AuthorDate,
    [JsonStringEnumMemberName("title_author")]
    TitleAuthor
  }

  public enum EBookLibInteract
  {
    None,
    CheckFile
  }

  public enum EAuthorizeResult
  {
    None,
    InvalidUrl,
    AuthorizationFailed,
    RegistrationFailed,
    RemoveFailed,
    Succ,
    DeregistrationFailed,
    RemoveProfileFailed,
  }

  [Flags]
  enum ECheckFile
  {
    None = 0,
    DeleteIfMissing = 1,
    Relocatable = 2
  }
}
