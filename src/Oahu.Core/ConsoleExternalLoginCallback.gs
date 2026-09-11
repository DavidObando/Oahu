package Oahu.Core

import Oahu.Aux
import System

class ConsoleExternalLogin {
    shared {
        func Callback(uri Uri) Uri {
            ShellExecute.Url(uri)
            Console.WriteLine("Paste final URL from browser:")
            while true {
                let finalUrl string? = Console.ReadLine()
                let succ = Uri.TryCreate(finalUrl, UriKind.Absolute, out var finalUri)
                if !succ {
                    Console.WriteLine("Invalid URL. Try again:")
                    continue
                }
                let auth Authorization? = Authorization.Create(finalUri)
                if auth == nil {
                    Console.WriteLine("URL does not contain authorization. Try again:")
                    continue
                }
                // TokenBearer token = TokenBearer.Create (finalUri);
                // if (token is null) {
                //  Console.WriteLine ("URL does not contain token. Try again:");
                //  continue;
                // }
                return finalUri
            }
        }
    }
}
