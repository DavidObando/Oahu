using System;
using System.Text.Json.Serialization;

namespace Oahu.Audible.Json
{
  public interface IPerson
  {
    [JsonPropertyName("asin")]
    string Asin { get; set; }

    [JsonPropertyName("name")]
    string Name { get; set; }
  }

  public class LibraryResponse : Serialization<LibraryResponse>
  {
    [JsonPropertyName("items")]
    public Product[] Items { get; set; }

    [JsonPropertyName("response_groups")]
    public string[] ResponseGroups { get; set; }
  }

  public class ProductResponse : Serialization<ProductResponse>
  {
    [JsonPropertyName("product")]
    public Product Product { get; set; }

    [JsonPropertyName("response_groups")]
    public string[] ResponseGroups { get; set; }
  }

  public class SimsBySeriesResponse : Serialization<SimsBySeriesResponse>
  {
    [JsonPropertyName("similar_products")]
    public Product[] SimilarProducts { get; set; }

    [JsonPropertyName("response_groups")]
    public string[] ResponseGroups { get; set; }
  }

  public class Product
  {
    [JsonPropertyName("asin")]
    public string Asin { get; set; }

    [JsonPropertyName("audible_editors_summary")]
    public string AudibleEditorsSummary { get; set; }

    [JsonPropertyName("authors")]
    public Author[] Authors { get; set; }

    [JsonPropertyName("available_codecs")]
    public Codec[] AvailableCodecs { get; set; }

    [JsonPropertyName("category_ladders")]
    public Category[] CategoryLadders { get; set; }

    [JsonPropertyName("content_delivery_type")]
    public string ContentDeliveryType { get; set; }

    [JsonPropertyName("content_rating")]
    public ContentRating ContentRating { get; set; }

    [JsonPropertyName("content_type")]
    public string ContentType { get; set; }

    [JsonPropertyName("customer_reviews")]
    public CustomerReviews[] CustomerReviews { get; set; }

    [JsonPropertyName("editorial_reviews")]
    public string[] EditorialReviews { get; set; }

    [JsonPropertyName("format_type")]
    public string FormatType { get; set; }

    [JsonPropertyName("has_children")]
    public bool? HasChildren { get; set; }

    [JsonPropertyName("is_adult_product")]
    public bool? IsAdultProduct { get; set; }

    [JsonPropertyName("is_ayce")]
    public bool? IsAyce { get; set; }

    [JsonPropertyName("is_downloaded")]
    public bool? IsDownloaded { get; set; }

    [JsonPropertyName("is_listenable")]
    public bool? IsListenable { get; set; }

    [JsonPropertyName("is_pdf_url_available")]
    public bool? IsPdfUrlAvailable { get; set; }

    [JsonPropertyName("is_pending")]
    public bool? IsPending { get; set; }

    [JsonPropertyName("is_playable")]
    public bool? IsPlayable { get; set; }

    [JsonPropertyName("is_preorderable")]
    public bool? IsPreorderable { get; set; }

    [JsonPropertyName("is_purchasability_suppressed")]
    public bool? IsPurchasabilitySuppressed { get; set; }

    [JsonPropertyName("is_removable")]
    public bool? IsRemovable { get; set; }

    [JsonPropertyName("is_removable_by_parent")]
    public bool? IsRemovableByParent { get; set; }

    [JsonPropertyName("is_returnable")]
    public bool? IsReturnable { get; set; }

    [JsonPropertyName("is_searchable")]
    public bool? IsSearchable { get; set; }

    [JsonPropertyName("is_visible")]
    public bool? IsVisible { get; set; }

    [JsonPropertyName("is_world_rights")]
    public bool? IsWorldRights { get; set; }

    [JsonPropertyName("is_ws4v_companion_asin_owned")]
    public bool? IsWs4vCompanionAsinOwned { get; set; }

    [JsonPropertyName("is_ws4v_enabled")]
    public bool? IsWs4vEnabled { get; set; }

    [JsonPropertyName("isbn")]
    public bool? Isbn { get; set; }

    [JsonPropertyName("issue_date")]
    public DateTime? IssueDate { get; set; }

    [JsonPropertyName("language")]
    public string Language { get; set; }

    [JsonPropertyName("library_status")]
    public LibraryStatus LibraryStatus { get; set; }

    [JsonPropertyName("merchandising_summary")]
    public string MerchandisingSummary { get; set; }

    [JsonPropertyName("music_id")]
    public object MusicId { get; set; }

    [JsonPropertyName("narrators")]
    public Narrator[] Narrators { get; set; }

    [JsonPropertyName("origin_asin")]
    public string OriginAsin { get; set; }

    [JsonPropertyName("origin_id")]
    public string OriginId { get; set; }

    [JsonPropertyName("origin_marketplace")]
    public string OriginMarketplace { get; set; }

    [JsonPropertyName("origin_type")]
    public string OriginType { get; set; }

    [JsonPropertyName("pdf_url")]
    public string PdfUrl { get; set; }

    [JsonPropertyName("percent_complete")]
    public float? PercentComplete { get; set; }

    [JsonPropertyName("plans")]
    public Plan[] Plans { get; set; }

    [JsonPropertyName("product_images")]
    public ProductImages ProductImages { get; set; }

    [JsonPropertyName("publication_name")]
    public string PublicationName { get; set; }

    [JsonPropertyName("publisher_name")]
    public string PublisherName { get; set; }

    [JsonPropertyName("publisher_summary")]
    public string PublisherSummary { get; set; }

    [JsonPropertyName("purchase_date")]
    public DateTime PurchaseDate { get; set; }

    [JsonPropertyName("rating")]
    public Rating Rating { get; set; }

    [JsonPropertyName("relationships")]
    public Relationship[] Relationships { get; set; }

    [JsonPropertyName("release_date")]
    public DateTime? ReleaseDate { get; set; }

    [JsonPropertyName("runtime_length_min")]
    public int? RuntimeLengthMin { get; set; }

    [JsonPropertyName("sample_url")]
    public string SampleUrl { get; set; }

    [JsonPropertyName("series")]
    public Series[] Series { get; set; }

    [JsonPropertyName("sku")]
    public string Sku { get; set; }

    [JsonPropertyName("sku_lite")]
    public string SkuLite { get; set; }

    [JsonPropertyName("social_media_images")]
    public SocialMediaImages SocialMediaImages { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; }

    [JsonPropertyName("subtitle")]
    public string Subtitle { get; set; }

    [JsonPropertyName("thesaurus_subject_keywords")]
    public string[] ThesaurusSubjectKeywords { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("voice_description")]
    public string VoiceDescription { get; set; }
  }

  public class ContentRating
  {
    [JsonPropertyName("steaminess")]
    public string Steaminess { get; set; }
  }

  public class LibraryStatus
  {
    [JsonPropertyName("date_added")]
    public DateTime DateAdded { get; set; }

    [JsonPropertyName("is_pending")]
    public bool? IsPending { get; set; }

    [JsonPropertyName("is_preordered")]
    public bool? IsPreordered { get; set; }

    [JsonPropertyName("is_removable")]
    public bool? IsRemovable { get; set; }

    [JsonPropertyName("is_visible")]
    public bool? IsVisible { get; set; }
  }

  public class ProductImages
  {
    [JsonPropertyName("500")]
    public string Image500 { get; set; }
  }

  public class Rating
  {
    [JsonPropertyName("num_reviews")]
    public int? NumReviews { get; set; }

    [JsonPropertyName("overall_distribution")]
    public Distribution OverallDistribution { get; set; }

    [JsonPropertyName("performance_distribution")]
    public Distribution PerformanceDistribution { get; set; }

    [JsonPropertyName("story_distribution")]
    public Distribution StoryDistribution { get; set; }
  }

  public class Distribution
  {
    [JsonPropertyName("average_rating")]
    public float? AverageRating { get; set; }

    [JsonPropertyName("display_average_rating")]
    public string DisplayAverageRating { get; set; }

    [JsonPropertyName("display_stars")]
    public float? DisplayStars { get; set; }

    [JsonPropertyName("num_five_star_ratings")]
    public int? NumFiveStarRatings { get; set; }

    [JsonPropertyName("num_four_star_ratings")]
    public int? NumFourStarRatings { get; set; }

    [JsonPropertyName("num_one_star_ratings")]
    public int? NumOneStarRatings { get; set; }

    [JsonPropertyName("num_ratings")]
    public int? NumRatings { get; set; }

    [JsonPropertyName("num_three_star_ratings")]
    public int? NumThreeStarRatings { get; set; }

    [JsonPropertyName("num_two_star_ratings")]
    public int? NumTwoStarRatings { get; set; }
  }

  public class SocialMediaImages
  {
    [JsonPropertyName("facebook")]
    public string Facebook { get; set; }

    [JsonPropertyName("twitter")]
    public string Twitter { get; set; }
  }

  public class Author : IPerson
  {
    [JsonPropertyName("asin")]
    public string Asin { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }
  }

  public class Codec
  {
    [JsonPropertyName("enhanced_codec")]
    public string EnhancedCodec { get; set; }

    [JsonPropertyName("format")]
    public string Format { get; set; }

    [JsonPropertyName("is_kindle_enhanced")]
    public bool? IsKindleEnhanced { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }
  }

  public class Category
  {
    [JsonPropertyName("ladder")]
    public Ladder[] Ladder { get; set; }

    [JsonPropertyName("root")]
    public string Root { get; set; }
  }

  public class Ladder
  {
    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }
  }

  public class CustomerReviews
  {
    [JsonPropertyName("asin")]
    public string Asin { get; set; }

    [JsonPropertyName("author_id")]
    public string AuthorId { get; set; }

    [JsonPropertyName("author_name")]
    public string AuthorName { get; set; }

    [JsonPropertyName("body")]
    public string Body { get; set; }

    [JsonPropertyName("format")]
    public string Format { get; set; }

    [JsonPropertyName("guided_responses")]
    public GuidedResponses[] GuidedResponses { get; set; }

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("location")]
    public string Location { get; set; }

    [JsonPropertyName("ratings")]
    public Ratings Ratings { get; set; }

    [JsonPropertyName("review_content_scores")]
    public ReviewContentScores ReviewContentScores { get; set; }

    [JsonPropertyName("submission_date")]
    public DateTime? SubmissionDate { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }
  }

  public class Ratings
  {
    [JsonPropertyName("overall_rating")]
    public int? OverallRating { get; set; }

    [JsonPropertyName("performance_rating")]
    public int? PerformanceRating { get; set; }

    [JsonPropertyName("story_rating")]
    public int? StoryRating { get; set; }
  }

  public class ReviewContentScores
  {
    [JsonPropertyName("content_quality")]
    public int? ContentQuality { get; set; }

    [JsonPropertyName("num_helpful_votes")]
    public int? NumHelpfulVotes { get; set; }

    [JsonPropertyName("num_unhelpful_votes")]
    public int? NumUnhelpfulVotes { get; set; }
  }

  public class GuidedResponses
  {
    [JsonPropertyName("answer")]
    public string Answer { get; set; }

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("question")]
    public string Question { get; set; }

    [JsonPropertyName("question_type")]
    public string QuestionType { get; set; }
  }

  public class Narrator : IPerson
  {
    [JsonPropertyName("asin")]
    public string Asin { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }
  }

  public class Plan
  {
    [JsonPropertyName("end_date")]
    public DateTime? EndDate { get; set; }

    [JsonPropertyName("plan_name")]
    public string PlanName { get; set; }

    [JsonPropertyName("start_date")]
    public DateTime? StartDate { get; set; }
  }

  public class Relationship
  {
    [JsonPropertyName("asin")]
    public string Asin { get; set; }

    [JsonPropertyName("content_delivery_type")]
    public string ContentDeliveryType { get; set; }

    [JsonPropertyName("relationship_to_product")]
    public string RelationshipToProduct { get; set; }

    [JsonPropertyName("relationship_type")]
    public string RelationshipType { get; set; }

    [JsonPropertyName("sequence")]
    public string Sequence { get; set; }

    [JsonPropertyName("sku")]
    public string Sku { get; set; }

    [JsonPropertyName("sku_lite")]
    public string SkuLite { get; set; }

    [JsonPropertyName("sort")]
    public string Sort { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("url")]
    public string Url { get; set; }
  }

  public class Series
  {
    [JsonPropertyName("asin")]
    public string Asin { get; set; }

    [JsonPropertyName("sequence")]
    public string Sequence { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("url")]
    public string Url { get; set; }
  }
}
