using System;

namespace Oahu.Aux
{
  /// <summary>
  /// Implementing <see cref="IResource"/> and using it with <see cref="ResourceGuard"/> allows
  /// RAII behavior within the lifecycle of an instance, beyond ctor/dtor, e.g. for indentation of text.
  /// </summary>
  public interface IResource
  {
    void Acquire();

    void Release();
  }

  /// <summary>
  /// The "using" statement in C# is syntactic sugar for try {} finally {} and implements the RAII programming idiom.
  /// In conjunction with <see cref="ResourceGuard"/> and optionally <see cref="IResource"/> it can be used
  /// for all sorts of dedicated and guaranteed scope entry/exit action.
  ///
  /// <para>Examples:</para>
  /// <para>
  /// var resource = new NonIDisposableResource();
  /// using (new ResourceGuard(() => resource.Close()) {
  ///   /* ... */
  /// }
  /// </para>
  /// <para>
  /// bool flag = false;
  /// using (new ResourceGuard(x => flag = x)) {
  ///   /* ... */
  /// }
  /// </para>
  /// <para>
  /// var stopwatch = Stopwatch.StartNew();
  /// /* pausing(!) stopwatch */
  /// using (new ResourceGuard(x => {
  ///     if (x) stopwatch.Stop(); else stopwatch.Start();
  ///   })) {
  ///   /* ... */
  /// }
  /// </para>
  /// <para>
  /// class Indent : IResource { /*...*/ }
  /// Indent ind = new Indent ();
  /// using (new ResourceGuard(ind)) {
  ///   /* ... */
  /// }
  /// </para>
  /// </summary>
  public class ResourceGuard : IDisposable
  {
    readonly Action onDispose;
    readonly Action<bool> onNewAndDispose;
    readonly IResource resource;

    public ResourceGuard(IResource resource)
    {
      this.resource = resource;
      this.resource.Acquire();
    }

    public ResourceGuard(Action onDispose)
    {
      this.onDispose = onDispose;
    }

    public ResourceGuard(Action<bool> onNewAndDispose)
    {
      this.onNewAndDispose = onNewAndDispose;
      this.onNewAndDispose?.Invoke(true);
    }

    public void Dispose()
    {
      onDispose?.Invoke();
      onNewAndDispose?.Invoke(false);
      resource?.Release();
    }
  }
}
