using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Linq;
using System.Reflection;
using Oahu.Aux.Extensions;

namespace Oahu.Aux.Diagnostics
{
  public static class TreeDecomposition
  {
    /// <summary>
    /// Custom marker/separator for description text. Will use default if <c>null</c>.
    /// </summary>
    public static string DescriptionMarker { get; set; }
  }

  static class WhereSelectEx
  {
    public static T FirstOfType<T>(this IEnumerable<object> enumerable) where T : class
    {
      return enumerable.OfType<T>().FirstOrDefault();
    }

    [UnconditionalSuppressMessage("Trimming", "IL2075", Justification = "DeclaringType is expected to preserve interface metadata at runtime.")]
    [UnconditionalSuppressMessage("Trimming", "IL2070", Justification = "Interface types preserve property metadata at runtime.")]
    public static IEnumerable<object> GetCustomAttributesIncludingBaseInterfaces(this PropertyInfo pi)
    {
      return pi.GetCustomAttributes(true).
        Union(pi.DeclaringType.GetInterfaces().
          Select(it => it.GetProperty(pi.Name, pi.PropertyType)).
          Where(p => !p.IsNull()).
          SelectMany(p => p.GetCustomAttributes(true))).
        Distinct().
        ToList();
    }
  }

  /// <summary>
  /// <para>Decomposition of specified object into a text tree.</para>
  /// <para>Iterates public properties in specified object.
  /// One property name/value pair per text line.
  /// Hierarchy levels are determined by property type.
  /// Primitive types are written to the same hierarchy level.
  /// Non-primitive types are written to the next lower hierarchy level, working recursively.
  /// As an option, properties can additionally be grouped by implemented interfaces and their hierarchy.
  /// Hierarchy levels are indicated through indentation.
  /// Collections are decomposed by item, iterating <see cref="IEnumerable"/>.
  /// Custom primitive types can be set by providing a generic argument, implementing <see cref="IPrimitiveTypes"/>.</para>
  /// <para>Built-in primitive types as per definition here are not only the scalar types (int, double etc)
  /// but also string, enum, and - important - all other .Net framework types in the System namespaces.
  /// (The purpose of this facility is to decompose user types, not system types.)
  /// Built-in primitive type handling can be overridden
  /// by custom primimitive types.</para>
  /// <para>Note: <see cref="AbstractPrimitiveTypes"/> can be used as a base class to implement <see cref="IPrimitiveTypes"/>.</para>
  /// <para>Properties can be annotated with attributes. Recognized attributes are:</para>
  /// <list type="bullet">
  /// <item><see cref="DescriptionAttribute"/>to describe a property, must be activated with <see cref="EDumpFlags.InclDesc"/></item>
  /// <item><see cref="BrowsableAttribute"/>to hide a property, if set to <c>false</c>.</item>
  /// <item><see cref="DisplayNameAttribute"/>to override the property name.</item>
  /// <item><see cref="DisplayItemNameAttribute"/>to override the item name in a collection.</item>
  /// <item><see cref="TextFormatAttribute"/>to specify a format string.</item></list>
  /// <item><see cref="ToStringAttribute"/>to specify a custom ToString() method with a type converter derived from <see cref="ToStringConverter"/>.</item></list>
  /// <para>To be used as a singleton from extension methods, see <see cref="TreeDecompositionExtension"/> for details.</para>
  /// </summary>
  /// <typeparam name="T">Additional primitive types, implementing <see cref="IPrimitiveTypes"/></typeparam>
  internal class TreeDecomposition<T>
    where T : IPrimitiveTypes, new()
  {
    static IPrimitiveTypes primitveTypes = new T();

    static TreeDecomposition<T> @default;

    private TreeDecomposition()
    {
    }

    public static TreeDecomposition<T> Default
    {
      get
      {
        if (@default is null)
        {
          @default = new TreeDecomposition<T>();
        }

        return @default;
      }
    }

    /// <summary>
    /// Dumps the specified object as a text tree. Will be used recursively.
    /// </summary>
    /// <param name="o">The object to dump.</param>
    /// <param name="tw">The TextWriter output.</param>
    /// <param name="ind">The indentation.</param>
    /// <param name="flags">The output modifier flags.</param>
    /// <param name="caption">The optional caption for this indentation level.</param>
    public void Dump(object o, TextWriter tw, Indent ind, EDumpFlags flags = default, string caption = null) =>
      DumpInternal(o, new Stack<Type>(), tw, ind, flags, caption, null, null, null, false);

    private static CustomFormat GetCustomFormat(IEnumerable<object> attrs)
    {
      CustomFormat customFormat = null;
      var toStringAttr = attrs.FirstOfType<ToStringAttribute>();
      if (toStringAttr.IsNull())
      {
        string format = attrs.FirstOfType<TextFormatAttribute>()?.Format;
        if (!format.IsNull())
        {
          customFormat = new CustomFormatString(format);
        }
      }
      else
        if (!toStringAttr.Converter.IsNull())
      {
        customFormat = new CustomToString(toStringAttr.Converter, toStringAttr.Format);
      }

      return customFormat;
    }

    private static bool IsPrimitiveType(Type type)
    {
      // determine what defines a primitive type
      if (type is null)
      {
        return true;
      }

      // simple cases
      bool isBuiltInPrimitive =
          type.IsPrimitive ||
          type == typeof(decimal) ||
          type == typeof(string) ||
          type.IsEnum;

      // "catch all"
      bool isSystemType =
          type.Namespace.StartsWith(nameof(System));

      // but not if it is enumerable
      bool isEnumerableSystemType = typeof(IEnumerable).IsAssignableFrom(type);
      if (isEnumerableSystemType)
      {
        isSystemType = false;
      }

      // type.IsPrimitive ||
      // type == typeof (decimal) ||
      // type == typeof (string) ||
      // type == typeof (DateTime) ||
      // type == typeof (DateTimeOffset) ||
      // type == typeof (TimeSpan);
      // ||  Nullable.GetUnderlyingType (type) != null;
      bool isAddedPrimitive = primitveTypes.IsPrimitiveType(type);

      bool isPrimitive = isBuiltInPrimitive || isSystemType || isAddedPrimitive;
      return isPrimitive;
    }

    private static void Write(TextWriter tw, Indent ind, string value, EDumpFlags flags, string desc = null)
    {
      if (value.IsNullOrWhiteSpace())
      {
        return;
      }

      var (m1, m2) = Mkr();
      string c = flags.HasFlag(EDumpFlags.ByInterface) ? string.Empty : ":";

      if (desc.IsNullOrWhiteSpace())
      {
        tw.WriteLine($"{ind}{value}{c}");
      }
      else if (flags.HasFlag(EDumpFlags.DescOnTop))
      {
        tw.WriteLine();
        tw.WriteLine(ind + m1 + desc);
        tw.WriteLine($"{ind}{value}{c}");
      }
      else
      {
        tw.WriteLine($"{ind}{value}{m2}{desc}");
      }
    }

    private static void Write(TextWriter tw, Indent ind, string name, object value, CustomFormat format, string desc = null, bool descOnTop = false)
    {
      var (m1, m2) = Mkr();

      string sValue;
      if (!format.IsNull())
      {
        try
        {
          switch (format)
          {
            case CustomToString c:
              sValue = c.Converter.ToString(value, c.Format);
              break;
            case CustomFormatString s:
              sValue = string.Format($"{{0:{s.Format}}}", value);
              break;
            default:
              sValue = value.ToString();
              break;
          }
        }
        catch
        {
          sValue = value.ToString();
        }
      }
      else
      {
        sValue = primitveTypes.ToString(value);
        if (sValue is null && value.GetType().IsEnum)
        {
          sValue = primitveTypes.ToString<Enum>(value);
        }

        if (sValue is null)
        {
          sValue = value.ToString();
        }
      }

      if (name.IsNullOrWhiteSpace())
      {
        tw.WriteLine(ind + sValue);
      }
      else if (desc.IsNullOrWhiteSpace())
      {
        tw.WriteLine(Snamval(ind, name, sValue));
      }
      else if (descOnTop)
      {
        tw.WriteLine();
        tw.WriteLine(ind + m1 + desc);
        tw.WriteLine(Snamval(ind, name, sValue));
      }
      else
      {
        tw.WriteLine(Snamval(ind, name, sValue) + m2 + desc);
      }
    }

    private static (string M1, string M2) Mkr()
    {
      string m = TreeDecomposition.DescriptionMarker ?? "!";
      string m1 = m + " ";
      string m2 = "  " + m1;
      return (m1, m2);
    }

    private static string Snamval(Indent ind, string name, string sValue) => $"{ind}{name} = {sValue}";

    [UnconditionalSuppressMessage("Trimming", "IL2075", Justification = "Type metadata is preserved via TrimMode=partial.")]
    [UnconditionalSuppressMessage("Trimming", "IL2070", Justification = "Type metadata is preserved via TrimMode=partial.")]
    [UnconditionalSuppressMessage("Trimming", "IL2072", Justification = "Type metadata is preserved via TrimMode=partial.")]
    private void DumpInternal(
      object o, Stack<Type> stack, TextWriter tw, Indent ind, EDumpFlags flags,
      string caption, string itemCaption, CustomFormat itemFormat, string oDesc, bool inEnum)
    {
      if (o is null)
      {
        return;
      }

      // via reflection
      Type objectType = o.GetType();
      stack.Push(objectType);

      if (caption is null && ind.Level == 0)
      {
        caption = objectType.Name;
      }

      // caption
      Write(tw, ind, caption, flags, oDesc);

      // next level
      using (new ResourceGuard(ind))
      {
        // is it a collection?
        bool isEnumerable = typeof(IEnumerable).IsAssignableFrom(objectType);

        if (isEnumerable)
        {
          DumpCollection(o, stack, objectType, tw, ind, flags, itemCaption, itemFormat);
        }
        else
        {
          // all public properties, including inherited ones
          IEnumerable<PropertyInfo> propInfos = objectType.GetProperties(BindingFlags.Public | BindingFlags.Instance);

          if (flags.HasFlag(EDumpFlags.ByInterface) && (stack.Count < 2 || flags.HasFlag(EDumpFlags.ByInterfaceNestedTypes)))
          {
            var interfaceHierarchy = objectType.GetInterfaceHierarchy();
            if (interfaceHierarchy.Count() > 0)
            {
              foreach (var path in interfaceHierarchy)
              {
                DumpByPath(ref propInfos, o, path, stack, tw, ind, flags, inEnum);
              }

              DumpProperties(o, propInfos, stack, tw, ind, flags, inEnum);
            }
            else
            {
              DumpProperties(o, propInfos, stack, tw, ind, flags, inEnum);
            }
          }
          else
          {
            DumpProperties(o, propInfos, stack, tw, ind, flags, inEnum);
          }
        }
      }

      stack.Pop();
    }

    [UnconditionalSuppressMessage("Trimming", "IL2075", Justification = "Interface types are preserved via TrimMode=partial.")]
    private void DumpByPath(
      ref IEnumerable<PropertyInfo> propInfos, object o, IEnumerable<Type> path,
      Stack<Type> stack, TextWriter tw, Indent ind, EDumpFlags flags, bool inEnum)
    {
      Type ifcType = path.Last();
      if (!ifcType.IsInterface)
      {
        return;
      }

      IEnumerable<PropertyInfo> ifcPropInfos = ifcType.GetProperties();
      if (ifcPropInfos.Count() == 0)
      {
        return;
      }

      var propNames = ifcPropInfos.Select(pi => pi.Name);
      var filteredPropInfos = propInfos.Where(pi => propNames.Contains(pi.Name));
      if (filteredPropInfos.Count() == 0)
      {
        return;
      }

      propInfos = propInfos.Except(filteredPropInfos);

      string sPath = path.ToHierarchyString();
      tw.WriteLine($"{ind}:{sPath}");
      using (new ResourceGuard(ind))
      {
        DumpProperties(o, filteredPropInfos, stack, tw, ind, flags, inEnum);
      }
    }

    private void DumpProperties(object o, IEnumerable<PropertyInfo> propInfos, Stack<Type> stack, TextWriter tw, Indent ind, EDumpFlags flags, bool inEnum)
    {
      foreach (var propInfo in propInfos)
      {
        // skip indexed
        bool isIndexed = propInfo.GetIndexParameters().Length > 0;
        if (isIndexed)
        {
          continue;
        }

        // value
        object propValue = propInfo.GetValue(o);

        // skip null
        if (!flags.HasFlag(EDumpFlags.InclNullVals))
        {
          if (propValue is null)
          {
            continue;
          }
          else

          // skip whitespace
          if (propValue is string sPropValue)
          {
            if (sPropValue.IsNullOrWhiteSpace())
            {
              continue;
            }
          }
        }

        // recursive types only allowed to maximum depth, exceeding instance will be handled as primitive type
        bool isRecursive = stack.Where(t => t == propInfo.PropertyType).Count() > 20;

        // check for modification attributes
        IEnumerable<object> attrs = null;
        if (flags.HasFlag(EDumpFlags.InherInterfaceAttribs))
        {
          attrs = propInfo.GetCustomAttributesIncludingBaseInterfaces();
        }
        else
        {
          attrs = propInfo.GetCustomAttributes(true);
        }

        // shall be ignored?
        var browsable = attrs.FirstOfType<BrowsableAttribute>();
        if (!(browsable?.Browsable ?? true))
        {
          continue;
        }

        // name
        string propName = propInfo.Name;

        // alternative name
        var displName = attrs.FirstOfType<DisplayNameAttribute>();
        if (displName != null)
        {
          propName = displName.DisplayName;
        }

        // alternative item name for collection
        string itemName = attrs.FirstOfType<DisplayItemNameAttribute>()?.Name;

        // optional custom formats
        CustomFormat customFormat = GetCustomFormat(attrs);

        // optional description
        string desc = GetDesc(propInfo, attrs, flags, inEnum);

        // actual type
        Type propType = propValue?.GetType();

        // how to dump
        if (IsPrimitiveType(propType) || isRecursive)
        {
          // this level, as primitive
          Write(tw, ind, propName, propValue, customFormat, desc, flags.HasFlag(EDumpFlags.DescOnTop));
        }
        else
        {
          // deeper level, recursive call
          DumpInternal(propValue, stack, tw, ind, flags, propName, itemName, customFormat, desc, inEnum);
        }
      }
    }

    private string GetDesc(PropertyInfo propInfo, IEnumerable<object> attrs, EDumpFlags flags, bool inEnum)
    {
      if (!flags.HasFlag(EDumpFlags.InclDesc) || (inEnum && !flags.HasFlag(EDumpFlags.InclDescInEnum)))
      {
        return null;
      }

      string desc = attrs.FirstOfType<DescriptionAttribute>()?.Description;
      if (desc.IsNull())
      {
        desc = GetTypeDesc(propInfo.PropertyType, flags, inEnum);
      }

      return desc;
    }

    private string GetTypeDesc(Type type, EDumpFlags flags, bool inEnum)
    {
      if (!flags.HasFlag(EDumpFlags.InclDesc) || !flags.HasFlag(EDumpFlags.InclTypeDesc) || (inEnum && !flags.HasFlag(EDumpFlags.InclDescInEnum)))
      {
        return null;
      }

      object[] attrs = type.GetCustomAttributes(true);
      return attrs.FirstOfType<DescriptionAttribute>()?.Description;
    }

    private void DumpCollection(object o, Stack<Type> stack, [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.Interfaces)] Type objectType, TextWriter tw, Indent ind,
      EDumpFlags flags, string itemCaption, CustomFormat itemFormat)
    {
      // item type
      Type itemType = objectType.GetInterfaces()
        .Where(t => t.IsGenericType && t.GetGenericTypeDefinition().Equals(typeof(IEnumerable<>)))
          .Select(t => t.GetGenericArguments()[0])
            .FirstOrDefault() ?? typeof(object);
      string desc = GetTypeDesc(itemType, flags, true);

      // if (!desc.IsNull())
      //  ; // for debug
      bool isPrimitive = IsPrimitiveType(itemType);

      if (flags.HasFlag(EDumpFlags.WithItmCnt))
      {
        if (itemCaption.IsNullOrWhiteSpace())
        {
          if (isPrimitive)
          {
            itemCaption = "#";
          }
          else
          {
            itemCaption = itemType.Name + " ";
          }
        }
        else
        {
          itemCaption += " ";
        }
      }
      else if (itemCaption.IsNullOrWhiteSpace() && !isPrimitive)
      {
        itemCaption = itemType.Name;
      }

      int i = 0;

      // hard cast
      foreach (var item in (IEnumerable)o)
      {
        i++;
        string caption;
        if (flags.HasFlag(EDumpFlags.WithItmCnt))
        {
          caption = $"{itemCaption}{i}";
        }
        else
        {
          caption = itemCaption;
        }

        if (isPrimitive)
        {
          // this level, as primitive
          Write(tw, ind, caption, item, itemFormat, desc, flags.HasFlag(EDumpFlags.DescOnTop));
        }
        else
        {
          // deeper level, recursive call
          DumpInternal(item, stack, tw, ind, flags, caption, itemCaption, itemFormat, desc, true);
        }
      }
    }

    abstract class CustomFormat
    {
    }

    class CustomFormatString : CustomFormat
    {
      public readonly string Format;

      public CustomFormatString(string format) => Format = format;
    }

    class CustomToString : CustomFormatString
    {
      public readonly ToStringConverter Converter;

      public CustomToString(ToStringConverter converter, string format) : base(format) => Converter = converter;
    }
  }
}
