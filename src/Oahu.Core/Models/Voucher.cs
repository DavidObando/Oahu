using System;
using System.Text.Json.Serialization;

namespace Oahu.Audible.Json
{
  public class Voucher : Serialization<Voucher>
  {
    [JsonPropertyName("key")]
    public string Key { get; set; }

    [JsonPropertyName("iv")]
    public string Iv { get; set; }

    [JsonPropertyName("rules")]
    public Rule[] Rules { get; set; }
  }

  public class Rule
  {
    [JsonPropertyName("parameters")]
    public Parameter[] Parameters { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }
  }

  public class Parameter
  {
    [JsonPropertyName("expireDate")]
    public DateTime ExpireDate { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; }
  }
}
