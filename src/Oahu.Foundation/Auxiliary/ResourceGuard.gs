package Oahu.Aux

import System

/// Implementing (cref:IResource) and using it with (cref:ResourceGuard) allows
/// RAII behavior within the lifecycle of an instance, beyond ctor/dtor, e.g. for indentation of text.
interface IResource {
    func Acquire();

    func Release();
}

/// The "using" statement in C# is syntactic sugar for try {} finally {} and implements the RAII
/// programming idiom.
/// In conjunction with (cref:ResourceGuard) and optionally (cref:IResource) it can be used
/// for all sorts of dedicated and guaranteed scope entry/exit action.
///
/// Examples:
///
/// var resource = new NonIDisposableResource();
/// using (new ResourceGuard(() => resource.Close()) {
/// /* ... */
/// }
///
/// bool flag = false;
/// using (new ResourceGuard(x => flag = x)) {
/// /* ... */
/// }
///
/// var stopwatch = Stopwatch.StartNew();
/// /* pausing(!) stopwatch */
/// using (new ResourceGuard(x => {
/// if (x) stopwatch.Stop(); else stopwatch.Start();
/// })) {
/// /* ... */
/// }
///
/// class Indent : IResource { /*...*/ }
/// Indent ind = new Indent ();
/// using (new ResourceGuard(ind)) {
/// /* ... */
/// }
class ResourceGuard : IDisposable {
    private let onDispose(() -> void)?
    private let onNewAndDispose((bool) -> void)?
    private let resource IResource?

    init(resource IResource) {
        this.resource = resource
        this.resource!!.Acquire()
    }

    init(onDispose() -> void) {
        this.onDispose = onDispose
    }

    init(onNewAndDispose(bool) -> void) {
        this.onNewAndDispose = onNewAndDispose
        this.onNewAndDispose?(true)
    }

    func Dispose() {
        onDispose?()
        onNewAndDispose?(false)
        resource?.Release()
    }
}
