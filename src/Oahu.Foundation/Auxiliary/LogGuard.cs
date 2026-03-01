using System;
using System.Runtime.CompilerServices;

namespace Oahu.Aux
{
  public class LogGuard : IDisposable
  {
    const string IN = ">>> ";
    const string OUT = "<<< ";
    readonly uint level;
    readonly Func<string> func;
    readonly string msg;
    readonly string method;
    readonly object caller;
    readonly Type type;
    bool isDispose;

    public LogGuard(uint level, Type type, Func<string> func, [CallerMemberName] string method = null)
    {
      this.level = level;
      this.type = type;
      this.func = func;
      this.method = method;
      Logging.Log(level, type, GetFuncMsg, method);
    }

    public LogGuard(uint level, object caller, Func<string> func, [CallerMemberName] string method = null)
    {
      this.level = level;
      this.caller = caller;
      this.func = func;
      this.method = method;
      Logging.Log(level, caller, GetFuncMsg, method);
    }

    public LogGuard(uint level, Type type, string msg, [CallerMemberName] string method = null)
    {
      this.level = level;
      this.type = type;
      this.msg = msg;
      this.method = method;
      Logging.Log(level, type, GetMsg, method);
    }

    public LogGuard(uint level, object caller, string msg, [CallerMemberName] string method = null)
    {
      this.level = level;
      this.caller = caller;
      this.msg = msg;
      this.method = method;
      Logging.Log(level, caller, GetMsg(), method);
    }

    public LogGuard(uint level, Type type, [CallerMemberName] string method = null)
    {
      this.level = level;
      this.type = type;
      this.method = method;
      Logging.Log(level, type, () => IN, method);
    }

    public LogGuard(uint level, object caller, [CallerMemberName] string method = null)
    {
      this.level = level;
      this.caller = caller;
      this.method = method;
      Logging.Log(level, caller, () => IN, method);
    }

    public void Dispose()
    {
      isDispose = true;
      if (type is null)
      {
        if (func is null)
        {
          if (msg is null)
          {
            Logging.Log(level, caller, () => OUT, method);
          }
          else
          {
            Logging.Log(level, caller, GetMsg(), method);
          }
        }
        else
        {
          Logging.Log(level, caller, GetFuncMsg, method);
        }
      }
      else if (type is not null)
      {
        if (func is null)
        {
          if (msg is null)
          {
            Logging.Log(level, type, () => OUT, method);
          }
          else
          {
            Logging.Log(level, type, GetMsg(), method);
          }
        }
        else
        {
          Logging.Log(level, type, GetFuncMsg, method);
        }
      }
    }

    private string GetFuncMsg()
    {
      string prefix = isDispose ? OUT : IN;
      return prefix + func?.Invoke();
    }

    private string GetMsg()
    {
      string prefix = isDispose ? OUT : IN;
      return prefix + msg;
    }
  }
}
