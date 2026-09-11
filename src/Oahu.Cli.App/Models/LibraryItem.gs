package Oahu.Cli.App.Models

import System

/// A single book entry as the CLI sees it. Subset of `Oahu.Core.Book`; no Core leakage.
data class LibraryItem {
    prop Asin string {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }

    prop Subtitle string? {
        get;
        init;
    }

    private var _authors[]string = Array.Empty[string]()

    prop Authors[]string {
        get {
            return _authors
        }
        init {
            _authors = value
        }
    }

    private var _narrators[]string = Array.Empty[string]()

    prop Narrators[]string {
        get {
            return _narrators
        }
        init {
            _narrators = value
        }
    }

    prop Series string? {
        get;
        init;
    }

    prop SeriesPosition float64? {
        get;
        init;
    }

    prop Runtime TimeSpan? {
        get;
        init;
    }

    prop PurchaseDate DateTimeOffset? {
        get;
        init;
    }

    private var _isAvailable bool = true

    prop IsAvailable bool {
        get {
            return _isAvailable
        }
        init {
            _isAvailable = value
        }
    }

    prop HasMultiplePartFiles bool {
        get;
        init;
    }
}
