package Oahu.Aux

enum ECallbackType {
    Info,
    InfoCancel,
    Warning,
    Error,
    ErrorQuestion,
    ErrorQuestion3,
    Question,
    Question3
}

open data class InteractionMessage(Type ECallbackType, Message string) { }

open data class InteractionMessage[T](Type ECallbackType, Message string?, Custom T) : Oahu
    .Aux
    .InteractionMessage(Type, Message!!) { }
