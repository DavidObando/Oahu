package Oahu.Audible.Json

import System.Text.Json.Serialization

class LicenseResponse : Serialization[LicenseResponse] {
    @JsonPropertyName("content_license")
    prop ContentLicense ContentLicense

    @JsonPropertyName("response_groups")
    prop ResponseGroups[]string
}

class MetadataContainer : Serialization[MetadataContainer] {
    @JsonPropertyName("content_metadata")
    prop ContentMetadata ContentMetadata
}

class LicenseDenialReason {
    @JsonPropertyName("message")
    prop Message string

    @JsonPropertyName("rejectionReason")
    prop RejectionReason string

    @JsonPropertyName("validationType")
    prop ValidationType string
}

partial class ContentLicense {
    @JsonPropertyName("acr")
    prop Acr string

    @JsonPropertyName("asin")
    prop Asin string

    @JsonPropertyName("content_metadata")
    prop ContentMetadata ContentMetadata?

    @JsonPropertyName("drm_type")
    prop DrmType string

    @JsonPropertyName("granted_right")
    prop GrantedRight string

    @JsonPropertyName("license_denial_reasons")
    prop LicenseDenialReasons[]LicenseDenialReason

    @JsonPropertyName("license_id")
    prop LicenseId string

    @JsonPropertyName("license_response")
    prop LicenseResponseText string

    @JsonPropertyName("message")
    prop Message string

    @JsonPropertyName("request_id")
    prop RequestId string

    @JsonPropertyName("requires_ad_supported_playback")
    prop RequiresAdSupportedPlayback bool?

    @JsonPropertyName("status_code")
    prop StatusCode string

    @JsonPropertyName("voucher_id")
    prop VoucherId string

    @JsonPropertyName("voucher")
    prop Voucher Voucher?
}

class ContentMetadata {
    @JsonPropertyName("chapter_info")
    prop ChapterInfo ChapterInfo

    @JsonPropertyName("content_reference")
    prop ContentReference ContentReference

    @JsonPropertyName("content_url")
    prop ContentUrl ContentUrl

    @JsonPropertyName("last_position_heard")
    prop LastPositionHeard LastPositionHeard
}

class ChapterInfo {
    @JsonPropertyName("brandIntroDurationMs")
    prop BrandIntroDurationMs int32?

    @JsonPropertyName("brandOutroDurationMs")
    prop BrandOutroDurationMs int32?

    @JsonPropertyName("chapters")
    prop Chapters[]Chapter

    @JsonPropertyName("is_accurate")
    prop IsAccurate bool?

    @JsonPropertyName("runtime_length_ms")
    prop RuntimeLengthMs int32?

    @JsonPropertyName("runtime_length_sec")
    prop RuntimeLengthSec int32?
}

class Chapter {
    @JsonPropertyName("length_ms")
    prop LengthMs int32?

    @JsonPropertyName("start_offset_ms")
    prop StartOffsetMs int32?

    @JsonPropertyName("start_offset_sec")
    prop StartOffsetSec int32?

    @JsonPropertyName("title")
    prop Title string

    @JsonPropertyName("chapters")
    prop Chapters[]Chapter
}

class ContentReference {
    @JsonPropertyName("acr")
    prop Acr string

    @JsonPropertyName("asin")
    prop Asin string

    @JsonPropertyName("content_format")
    prop ContentFormat string

    @JsonPropertyName("content_size_in_bytes")
    prop ContentSizeInBytes int64?

    @JsonPropertyName("file_version")
    prop FileVersion string

    @JsonPropertyName("marketplace")
    prop Marketplace string

    @JsonPropertyName("sku")
    prop Sku string

    @JsonPropertyName("tempo")
    prop Tempo string

    @JsonPropertyName("version")
    prop Version string
}

class ContentUrl {
    @JsonPropertyName("offline_url")
    prop OfflineUrl string
}

class LastPositionHeard {
    @JsonPropertyName("last_updated")
    prop LastUpdated string

    @JsonPropertyName("position_ms")
    prop PositionMs int32?

    @JsonPropertyName("status")
    prop Status string
}
