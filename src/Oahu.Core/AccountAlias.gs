package Oahu.Core

import Oahu.CommonTypes
import System
import System.Collections.Generic

class AccountAliasContext {
    init(localId int32, customerName string?, hashes IEnumerable[uint32]?) {
        LocalId = localId
        CustomerName = customerName
        Hashes = hashes
    }

    prop LocalId int32 {
        get;
        init;
    }

    prop CustomerName string? {
        get;
        init;
    }

    prop Hashes IEnumerable[uint32]? {
        get;
        init;
    }

    prop Alias string?
}

class ProfileAliasKey : IEquatable[IProfileAliasKey], IProfileAliasKey {
    init() { }

    convenience init(other IProfileAliasKey) {
        init(other.Region, other.AccountAlias)
    }

    init(region ERegion, accountAlias string?) {
        Region = region
        AccountAlias = accountAlias
    }

    prop AccountAlias string?
    prop Region ERegion

    override func ToString() string -> "$AccountAlias; $Region"

    func Equals(other IProfileAliasKey) bool {
        return Region == other.Region && string.Equals(AccountAlias, other.AccountAlias)
    }
}
