using System;

namespace Oahu.Aux
{
  /// <summary>
  /// Implementation of the "Singleton" pattern.
  /// </summary>
  /// <typeparam name="T">Type of class to be instantiated as a singleton.</typeparam>
  public class Singleton<T> where T : class, new()
  {
    private static readonly object Lockable;
    private static T instance;

    /// <summary>
    /// Static ctor. Initializes the <see cref="Singleton{T}"/> class, but does not yet create the instance.
    /// </summary>
    static Singleton()
    {
      Lockable = new object();
    }

    /// <summary>
    /// Get the instance of the singleton.
    /// C#-style implementation as a property.
    /// </summary>
    /// <value>
    /// Instance of singleton.
    /// </value>
    public static T Instance
    {
      get
      {
        lock (Lockable)
        {
          if (instance is null)
          {
            instance = new T();
          }

          return instance;
        }
      }
    }

    public static void Dispose()
    {
      lock (Lockable)
      {
        if (instance is IDisposable obj)
        {
          obj.Dispose();
        }

        instance = null;
      }
    }
  }
}
