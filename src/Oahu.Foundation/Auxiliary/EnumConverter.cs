using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Resources;
using Oahu.Aux.Extensions;
using static Oahu.Aux.EnumUtil;

namespace Oahu.Aux
{
  public class EnumConverter<TEnum> : TypeConverter
    where TEnum : struct, Enum
  {
    private ResourceManager resourceManager;
    Dictionary<string, TEnum> reverseLookup;

    public EnumConverter()
    {
      Values = GetValues<TEnum>().ToArray();
    }

    protected IList<TEnum> Values { get; }

    protected ResourceManager ResourceManager
    {
      get => resourceManager;
      set
      {
        resourceManager = value;
        InitReverseLookup();
      }
    }

    public override bool GetStandardValuesSupported(ITypeDescriptorContext context) => true;

    public override StandardValuesCollection GetStandardValues(ITypeDescriptorContext context)
    {
      StandardValuesCollection svc = new StandardValuesCollection(Values.ToArray());
      return svc;
    }

    public override bool CanConvertTo(ITypeDescriptorContext context, Type destinationType)
    {
      if (destinationType != typeof(string))
      {
        return base.CanConvertTo(context, destinationType);
      }
      else
      {
        return true;
      }
    }

    public override bool CanConvertFrom(ITypeDescriptorContext context, Type sourceType)
    {
      if (sourceType != typeof(string))
      {
        return base.CanConvertFrom(context, sourceType);
      }
      else
      {
        return true;
      }
    }

    public override object ConvertTo(ITypeDescriptorContext context, CultureInfo culture, object value, Type destinationType)
    {
#if TRACE && EXTRA
      Trace.WriteLine ($"{nameof (ConvertTo)}: \"{value}\", from: {value.GetType ().Name}, to: {destinationType.Name}");
#endif
      switch (value)
      {
        default:
          return base.ConvertTo(context, culture, value, destinationType);
        case TEnum enm:
          return ToDisplayString(enm);
      }
    }

    public override object ConvertFrom(ITypeDescriptorContext context, CultureInfo culture, object value)
    {
#if TRACE && EXTRA
      Trace.WriteLine ($"{nameof (ConvertFrom)}: \"{value}\", from: {value.GetType ().Name}");
#endif
      if (!(reverseLookup is null))
      {
        if (value is string s)
        {
          bool succ = reverseLookup.TryGetValue(s, out TEnum e);
          if (succ)
          {
            return e;
          }
        }
      }

      return base.ConvertFrom(context, culture, value);
    }

    private string ToDisplayString(TEnum value) => ResourceManager.GetStringEx(value.ToString());

    private void InitReverseLookup()
    {
      reverseLookup = new Dictionary<string, TEnum>();
      foreach (var v in Values)
      {
        reverseLookup.Add(ToDisplayString(v), v);
      }
    }
  }
}
