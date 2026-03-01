using System.Text.Json.Serialization;

namespace Oahu.CommonTypes
{
  public enum ERegion
  {
    [JsonStringEnumMemberName("de")]
    De,
    [JsonStringEnumMemberName("us")]
    Us,
    [JsonStringEnumMemberName("uk")]
    Uk,
    [JsonStringEnumMemberName("fr")]
    Fr,
    [JsonStringEnumMemberName("ca")]
    Ca,
    [JsonStringEnumMemberName("it")]
    It,
    [JsonStringEnumMemberName("au")]
    Au,
    [JsonStringEnumMemberName("in")]
    @In,
    [JsonStringEnumMemberName("jp")]
    Jp,
    [JsonStringEnumMemberName("es")]
    Es,
    [JsonStringEnumMemberName("br")]
    Br
  }
}
