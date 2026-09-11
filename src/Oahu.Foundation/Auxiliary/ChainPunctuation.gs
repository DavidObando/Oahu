package Oahu.Aux

interface IChainPunctuation {
    prop Prefix string {
        get;
    }

    prop Suffix string {
        get;
    }

    prop Infix[]?string {
        get;
    }
}

open class ChainPunctuation : IChainPunctuation {
    open prop Prefix string {
        get;
    }

    open prop Suffix string {
        get;
    }

    open prop Infix[]?string {
        get;
    }
}
