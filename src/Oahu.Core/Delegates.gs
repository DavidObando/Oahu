package Oahu.Core

import Oahu.BooksDatabase
import System

delegate ConvertDelegate[T ICancellation](book Book, context T, onNewStateCallback(Conversion) -> void);

internal delegate ConfigTokenDelegate(enforce bool = false) ConfigurationTokenResult?;
