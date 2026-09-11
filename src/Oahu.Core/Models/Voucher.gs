package Oahu.Audible.Json

import System
import System.Text.Json.Serialization

class Voucher : Serialization[Voucher] {
    @JsonPropertyName("key")
    prop Key string

    @JsonPropertyName("iv")
    prop Iv string

    @JsonPropertyName("rules")
    prop Rules[]Rule
}

class Rule {
    @JsonPropertyName("parameters")
    prop Parameters[]Parameter

    @JsonPropertyName("name")
    prop Name string
}

class Parameter {
    @JsonPropertyName("expireDate")
    prop ExpireDate DateTime

    @JsonPropertyName("type")
    prop Type string
}
