using System.Text.Json.Serialization;

namespace Oahu.Audible.Json
{
  public class LicenseResponse : Serialization<LicenseResponse>
  {
    [JsonPropertyName("content_license")]
    public ContentLicense ContentLicense { get; set; }

    [JsonPropertyName("response_groups")]
    public string[] ResponseGroups { get; set; }
  }

  public class MetadataContainer : Serialization<MetadataContainer>
  {
    [JsonPropertyName("content_metadata")]
    public ContentMetadata ContentMetadata { get; set; }
  }

  public partial class ContentLicense
  {
    [JsonPropertyName("acr")]
    public string Acr { get; set; }

    [JsonPropertyName("asin")]
    public string Asin { get; set; }

    [JsonPropertyName("content_metadata")]
    public ContentMetadata ContentMetadata { get; set; }

    [JsonPropertyName("drm_type")]
    public string DrmType { get; set; }

    [JsonPropertyName("license_id")]
    public string LicenseId { get; set; }

    [JsonPropertyName("license_response")]
    public string LicenseResponseText { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; }

    [JsonPropertyName("request_id")]
    public string RequestId { get; set; }

    [JsonPropertyName("requires_ad_supported_playback")]
    public bool? RequiresAdSupportedPlayback { get; set; }

    [JsonPropertyName("status_code")]
    public string StatusCode { get; set; }

    [JsonPropertyName("voucher_id")]
    public string VoucherId { get; set; }

    [JsonPropertyName("voucher")]
    public Voucher Voucher { get; set; }
  }

  public class ContentMetadata
  {
    [JsonPropertyName("chapter_info")]
    public ChapterInfo ChapterInfo { get; set; }

    [JsonPropertyName("content_reference")]
    public ContentReference ContentReference { get; set; }

    [JsonPropertyName("content_url")]
    public ContentUrl ContentUrl { get; set; }

    [JsonPropertyName("last_position_heard")]
    public LastPositionHeard LastPositionHeard { get; set; }
  }

  public class ChapterInfo
  {
    [JsonPropertyName("brandIntroDurationMs")]
    public int? BrandIntroDurationMs { get; set; }

    [JsonPropertyName("brandOutroDurationMs")]
    public int? BrandOutroDurationMs { get; set; }

    [JsonPropertyName("chapters")]
    public Chapter[] Chapters { get; set; }

    [JsonPropertyName("is_accurate")]
    public bool? IsAccurate { get; set; }

    [JsonPropertyName("runtime_length_ms")]
    public int? RuntimeLengthMs { get; set; }

    [JsonPropertyName("runtime_length_sec")]
    public int? RuntimeLengthSec { get; set; }
  }

  public class Chapter
  {
    [JsonPropertyName("length_ms")]
    public int? LengthMs { get; set; }

    [JsonPropertyName("start_offset_ms")]
    public int? StartOffsetMs { get; set; }

    [JsonPropertyName("start_offset_sec")]
    public int? StartOffsetSec { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("chapters")]
    public Chapter[] Chapters { get; set; }
  }

  public class ContentReference
  {
    [JsonPropertyName("acr")]
    public string Acr { get; set; }

    [JsonPropertyName("asin")]
    public string Asin { get; set; }

    [JsonPropertyName("content_format")]
    public string ContentFormat { get; set; }

    [JsonPropertyName("content_size_in_bytes")]
    public long? ContentSizeInBytes { get; set; }

    [JsonPropertyName("file_version")]
    public string FileVersion { get; set; }

    [JsonPropertyName("marketplace")]
    public string Marketplace { get; set; }

    [JsonPropertyName("sku")]
    public string Sku { get; set; }

    [JsonPropertyName("tempo")]
    public string Tempo { get; set; }

    [JsonPropertyName("version")]
    public string Version { get; set; }
  }

  public class ContentUrl
  {
    [JsonPropertyName("offline_url")]
    public string OfflineUrl { get; set; }
  }

  public class LastPositionHeard
  {
    [JsonPropertyName("last_updated")]
    public string LastUpdated { get; set; }

    [JsonPropertyName("position_ms")]
    public int? PositionMs { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; }
  }
}
