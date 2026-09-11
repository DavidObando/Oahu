package Oahu.Core.Ex

import Oahu.Aux.Extensions
import Oahu.Core
import System.Collections.Generic

internal class Anonymizer {
    shared {
        private let _usernames Dictionary[uint32, string] = Dictionary[uint32, string]()

        prop Usernames Dictionary[uint32, string] {
            get {
                return _usernames
            }
        }

        private let _passwords Dictionary[uint32, string] = Dictionary[uint32, string]()

        prop Passwords Dictionary[uint32, string] {
            get {
                return _passwords
            }
        }

        func ReplaceWithSubstitute(
            dict Dictionary[uint32, string],
            source string?,
            password string,
            stub string
        ) string? {
            if source == nil {
                return nil
            }
            let subst = GetSubstitute(dict, password, stub)
            if source == nil {
                return subst
            } else {
                return source.Replace(password, subst)
            }
        }

        func GetSubstitute(dict Dictionary[uint32, string], key string, stub string) string {
            const C = '¿'
            let lkey = key.ToLower()
            let ukey = lkey.Checksum32()
            lock dict {
                let succ = dict.TryGetValue(ukey, out var subst)
                if !succ {
                    let n = dict.Count + 1
                    subst = "$C$stub$n$C"
                    dict[ukey] = subst
                }
                return subst
            }
        }
    }
}

func (source string) AnonymizeCredentials(creds Credentials?) string? {
    if creds == nil {
        return source
    }
    return source.AnonymizeUsernamePassword(creds.Username, creds.Password)
}

func (source string) AnonymizeUsernamePassword(username string, password string) string? {
    let intermed string? = source.AnonymizeUsername(username)
    let result string? = intermed.AnonymizePassword(password)
    return result
}

func (source string) AnonymizeUsername(username string) string? {
    if username.IsNullOrWhiteSpace() {
        return source
    }
    const STUB = "ACCNT"
    return Anonymizer.ReplaceWithSubstitute(Anonymizer.Usernames, source, username, STUB)
}

func (source string?) AnonymizePassword(password string) string? {
    if password.IsNullOrWhiteSpace() {
        return source
    }
    const STUB = "PASSW"
    return Anonymizer.ReplaceWithSubstitute(Anonymizer.Passwords, source, password, STUB)
}
