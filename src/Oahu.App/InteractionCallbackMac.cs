using System.Threading;
using Avalonia.Controls;
using Avalonia.Threading;
using Oahu.Aux;

namespace Oahu.App.Avalonia
{
  /// <summary>
  /// macOS implementation of IInteractionCallback using Avalonia message boxes.
  /// Bridges the business logic interaction pattern to Avalonia dialog windows.
  /// </summary>
  public class InteractionCallbackMac<T> : IInteractionCallback<T, bool?> where T : InteractionMessage
  {
    private readonly Window owner;

    public InteractionCallbackMac(Window owner)
    {
      this.owner = owner;
    }

    private enum MessageBoxButtons
    {
      Ok,
      OkCancel,
      YesNo,
      YesNoCancel
    }

    public bool? Interact(T value)
    {
      bool? result = null;

      // Marshal to UI thread if needed
      if (Dispatcher.UIThread.CheckAccess())
      {
        result = ShowDialog(value);
      }
      else
      {
        Dispatcher.UIThread.InvokeAsync(() =>
        {
          result = ShowDialog(value);
        }).Wait();
      }

      return result;
    }

    private bool? ShowDialog(InteractionMessage message)
    {
      // Map callback types to appropriate dialog styles
      var (title, buttons) = message.Type switch
      {
        ECallbackType.Info => ("Information", MessageBoxButtons.Ok),
        ECallbackType.InfoCancel => ("Information", MessageBoxButtons.OkCancel),
        ECallbackType.Warning => ("Warning", MessageBoxButtons.Ok),
        ECallbackType.Error => ("Error", MessageBoxButtons.Ok),
        ECallbackType.ErrorQuestion => ("Error", MessageBoxButtons.YesNo),
        ECallbackType.ErrorQuestion3 => ("Error", MessageBoxButtons.YesNoCancel),
        ECallbackType.Question => ("Question", MessageBoxButtons.YesNo),
        ECallbackType.Question3 => ("Question", MessageBoxButtons.YesNoCancel),
        _ => ("Message", MessageBoxButtons.Ok)
      };

      // For now, use a simple approach — log the message.
      // Full implementation would show an Avalonia dialog window.
      Logging.Log(1, this, () => $"[{title}] {message.Message}");

      // Default behavior: info/warning/error → true, questions → true (yes)
      return message.Type switch
      {
        ECallbackType.Question or ECallbackType.Question3 or
        ECallbackType.ErrorQuestion or ECallbackType.ErrorQuestion3 => true,
        _ => true
      };
    }
  }
}
