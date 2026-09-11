package Oahu.Audible.Json

import System
import System.Text.Json.Serialization

interface IPerson {
    @JsonPropertyName("asin")
    prop Asin string?

    @JsonPropertyName("name")
    prop Name string
}

class LibraryResponse : Serialization[LibraryResponse] {
    @JsonPropertyName("items")
    prop Items[]?Product

    @JsonPropertyName("response_groups")
    prop ResponseGroups[]string
}

class ProductResponse : Serialization[ProductResponse] {
    @JsonPropertyName("product")
    prop Product Product

    @JsonPropertyName("response_groups")
    prop ResponseGroups[]string
}

class SimsBySeriesResponse : Serialization[SimsBySeriesResponse] {
    @JsonPropertyName("similar_products")
    prop SimilarProducts[]Product

    @JsonPropertyName("response_groups")
    prop ResponseGroups[]string
}

class Product {
    @JsonPropertyName("asin")
    prop Asin string

    @JsonPropertyName("audible_editors_summary")
    prop AudibleEditorsSummary string

    @JsonPropertyName("authors")
    prop Authors[]Author

    @JsonPropertyName("available_codecs")
    prop AvailableCodecs[]Codec

    @JsonPropertyName("category_ladders")
    prop CategoryLadders[]Category

    @JsonPropertyName("content_delivery_type")
    prop ContentDeliveryType string

    @JsonPropertyName("content_rating")
    prop ContentRating ContentRating

    @JsonPropertyName("content_type")
    prop ContentType string

    @JsonPropertyName("customer_reviews")
    prop CustomerReviews[]CustomerReviews

    @JsonPropertyName("editorial_reviews")
    prop EditorialReviews[]string

    @JsonPropertyName("format_type")
    prop FormatType string

    @JsonPropertyName("has_children")
    prop HasChildren bool?

    @JsonPropertyName("is_adult_product")
    prop IsAdultProduct bool?

    @JsonPropertyName("is_ayce")
    prop IsAyce bool?

    @JsonPropertyName("is_downloaded")
    prop IsDownloaded bool?

    @JsonPropertyName("is_listenable")
    prop IsListenable bool?

    @JsonPropertyName("is_pdf_url_available")
    prop IsPdfUrlAvailable bool?

    @JsonPropertyName("is_pending")
    prop IsPending bool?

    @JsonPropertyName("is_playable")
    prop IsPlayable bool?

    @JsonPropertyName("is_preorderable")
    prop IsPreorderable bool?

    @JsonPropertyName("is_purchasability_suppressed")
    prop IsPurchasabilitySuppressed bool?

    @JsonPropertyName("is_removable")
    prop IsRemovable bool?

    @JsonPropertyName("is_removable_by_parent")
    prop IsRemovableByParent bool?

    @JsonPropertyName("is_returnable")
    prop IsReturnable bool?

    @JsonPropertyName("is_searchable")
    prop IsSearchable bool?

    @JsonPropertyName("is_visible")
    prop IsVisible bool?

    @JsonPropertyName("is_world_rights")
    prop IsWorldRights bool?

    @JsonPropertyName("is_ws4v_companion_asin_owned")
    prop IsWs4vCompanionAsinOwned bool?

    @JsonPropertyName("is_ws4v_enabled")
    prop IsWs4vEnabled bool?

    @JsonPropertyName("isbn")
    prop Isbn bool?

    @JsonPropertyName("issue_date")
    prop IssueDate DateTime?

    @JsonPropertyName("language")
    prop Language string

    @JsonPropertyName("library_status")
    prop LibraryStatus LibraryStatus

    @JsonPropertyName("merchandising_summary")
    prop MerchandisingSummary string

    @JsonPropertyName("music_id")
    prop MusicId object

    @JsonPropertyName("narrators")
    prop Narrators[]Narrator

    @JsonPropertyName("origin_asin")
    prop OriginAsin string

    @JsonPropertyName("origin_id")
    prop OriginId string

    @JsonPropertyName("origin_marketplace")
    prop OriginMarketplace string

    @JsonPropertyName("origin_type")
    prop OriginType string

    @JsonPropertyName("pdf_url")
    prop PdfUrl string

    @JsonPropertyName("percent_complete")
    prop PercentComplete float32?

    @JsonPropertyName("plans")
    prop Plans[]Plan

    @JsonPropertyName("product_images")
    prop ProductImages ProductImages?

    @JsonPropertyName("publication_name")
    prop PublicationName string

    @JsonPropertyName("publisher_name")
    prop PublisherName string

    @JsonPropertyName("publisher_summary")
    prop PublisherSummary string

    @JsonPropertyName("purchase_date")
    prop PurchaseDate DateTime

    @JsonPropertyName("rating")
    prop Rating Rating?

    @JsonPropertyName("relationships")
    prop Relationships[]Relationship

    @JsonPropertyName("release_date")
    prop ReleaseDate DateTime?

    @JsonPropertyName("runtime_length_min")
    prop RuntimeLengthMin int32?

    @JsonPropertyName("sample_url")
    prop SampleUrl string

    @JsonPropertyName("series")
    prop Series[]Series

    @JsonPropertyName("sku")
    prop Sku string

    @JsonPropertyName("sku_lite")
    prop SkuLite string

    @JsonPropertyName("social_media_images")
    prop SocialMediaImages SocialMediaImages

    @JsonPropertyName("status")
    prop Status string

    @JsonPropertyName("subtitle")
    prop Subtitle string

    @JsonPropertyName("thesaurus_subject_keywords")
    prop ThesaurusSubjectKeywords[]string

    @JsonPropertyName("title")
    prop Title string

    @JsonPropertyName("voice_description")
    prop VoiceDescription string
}

class ContentRating {
    @JsonPropertyName("steaminess")
    prop Steaminess string
}

class LibraryStatus {
    @JsonPropertyName("date_added")
    prop DateAdded DateTime

    @JsonPropertyName("is_pending")
    prop IsPending bool?

    @JsonPropertyName("is_preordered")
    prop IsPreordered bool?

    @JsonPropertyName("is_removable")
    prop IsRemovable bool?

    @JsonPropertyName("is_visible")
    prop IsVisible bool?
}

class ProductImages {
    @JsonPropertyName("500")
    prop Image500 string
}

class Rating {
    @JsonPropertyName("num_reviews")
    prop NumReviews int32?

    @JsonPropertyName("overall_distribution")
    prop OverallDistribution Distribution

    @JsonPropertyName("performance_distribution")
    prop PerformanceDistribution Distribution

    @JsonPropertyName("story_distribution")
    prop StoryDistribution Distribution
}

class Distribution {
    @JsonPropertyName("average_rating")
    prop AverageRating float32?

    @JsonPropertyName("display_average_rating")
    prop DisplayAverageRating string

    @JsonPropertyName("display_stars")
    prop DisplayStars float32?

    @JsonPropertyName("num_five_star_ratings")
    prop NumFiveStarRatings int32?

    @JsonPropertyName("num_four_star_ratings")
    prop NumFourStarRatings int32?

    @JsonPropertyName("num_one_star_ratings")
    prop NumOneStarRatings int32?

    @JsonPropertyName("num_ratings")
    prop NumRatings int32?

    @JsonPropertyName("num_three_star_ratings")
    prop NumThreeStarRatings int32?

    @JsonPropertyName("num_two_star_ratings")
    prop NumTwoStarRatings int32?
}

class SocialMediaImages {
    @JsonPropertyName("facebook")
    prop Facebook string

    @JsonPropertyName("twitter")
    prop Twitter string
}

class Author : IPerson {
    @JsonPropertyName("asin")
    prop Asin string?

    @JsonPropertyName("name")
    prop Name string
}

class Codec {
    @JsonPropertyName("enhanced_codec")
    prop EnhancedCodec string

    @JsonPropertyName("format")
    prop Format string

    @JsonPropertyName("is_kindle_enhanced")
    prop IsKindleEnhanced bool?

    @JsonPropertyName("name")
    prop Name string
}

class Category {
    @JsonPropertyName("ladder")
    prop Ladder[]Ladder

    @JsonPropertyName("root")
    prop Root string
}

class Ladder {
    @JsonPropertyName("id")
    prop Id string

    @JsonPropertyName("name")
    prop Name string
}

class CustomerReviews {
    @JsonPropertyName("asin")
    prop Asin string

    @JsonPropertyName("author_id")
    prop AuthorId string

    @JsonPropertyName("author_name")
    prop AuthorName string

    @JsonPropertyName("body")
    prop Body string

    @JsonPropertyName("format")
    prop Format string

    @JsonPropertyName("guided_responses")
    prop GuidedResponses[]GuidedResponses

    @JsonPropertyName("id")
    prop Id string

    @JsonPropertyName("location")
    prop Location string

    @JsonPropertyName("ratings")
    prop Ratings Ratings

    @JsonPropertyName("review_content_scores")
    prop ReviewContentScores ReviewContentScores

    @JsonPropertyName("submission_date")
    prop SubmissionDate DateTime?

    @JsonPropertyName("title")
    prop Title string
}

class Ratings {
    @JsonPropertyName("overall_rating")
    prop OverallRating int32?

    @JsonPropertyName("performance_rating")
    prop PerformanceRating int32?

    @JsonPropertyName("story_rating")
    prop StoryRating int32?
}

class ReviewContentScores {
    @JsonPropertyName("content_quality")
    prop ContentQuality int32?

    @JsonPropertyName("num_helpful_votes")
    prop NumHelpfulVotes int32?

    @JsonPropertyName("num_unhelpful_votes")
    prop NumUnhelpfulVotes int32?
}

class GuidedResponses {
    @JsonPropertyName("answer")
    prop Answer string

    @JsonPropertyName("id")
    prop Id string

    @JsonPropertyName("question")
    prop Question string

    @JsonPropertyName("question_type")
    prop QuestionType string
}

class Narrator : IPerson {
    @JsonPropertyName("asin")
    prop Asin string?

    @JsonPropertyName("name")
    prop Name string
}

class Plan {
    @JsonPropertyName("end_date")
    prop EndDate DateTime?

    @JsonPropertyName("plan_name")
    prop PlanName string

    @JsonPropertyName("start_date")
    prop StartDate DateTime?
}

class Relationship {
    @JsonPropertyName("asin")
    prop Asin string

    @JsonPropertyName("content_delivery_type")
    prop ContentDeliveryType string

    @JsonPropertyName("relationship_to_product")
    prop RelationshipToProduct string

    @JsonPropertyName("relationship_type")
    prop RelationshipType string

    @JsonPropertyName("sequence")
    prop Sequence string

    @JsonPropertyName("sku")
    prop Sku string

    @JsonPropertyName("sku_lite")
    prop SkuLite string

    @JsonPropertyName("sort")
    prop Sort string

    @JsonPropertyName("title")
    prop Title string

    @JsonPropertyName("url")
    prop Url string
}

class Series {
    @JsonPropertyName("asin")
    prop Asin string

    @JsonPropertyName("sequence")
    prop Sequence string

    @JsonPropertyName("title")
    prop Title string

    @JsonPropertyName("url")
    prop Url string
}
