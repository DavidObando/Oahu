package Oahu.Aux

interface IInteractionCallback[T, out TResult] {
    func Interact(value T) TResult;
}
