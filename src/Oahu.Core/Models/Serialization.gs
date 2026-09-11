package Oahu.Audible.Json

import Oahu.Aux
import Oahu.Aux.Extensions
import System
import System.Text.Json

open class Serialization[T] {
    func Serialize() string {
        return JsonSerializer.Serialize(this, typeof(T), Options)
    }

    shared {
        private let _options JsonSerializerOptions = Oahu.Aux.Extensions.JsonExtensions.Options

        private prop Options JsonSerializerOptions {
            get {
                return _options
            }
        }

        func Deserialize(json string?) T {
            try {
                return JsonSerializer.Deserialize[T](json!!, Options)
            } catch (exc Exception) {
                Logging.Log(1, typeof(Serialization[T]), () -> exc.Summary())
                return default(T)
            }
        }
    }
}
