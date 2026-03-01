namespace Oahu.Aux
{
  public enum ECallbackType
  {
    Info, InfoCancel, Warning, Error, ErrorQuestion, ErrorQuestion3, Question, Question3
  }

  public record InteractionMessage(
    ECallbackType Type,
    string Message);

  public record InteractionMessage<T>(ECallbackType Type, string Message, T Custom) :
    InteractionMessage(Type, Message);
}
