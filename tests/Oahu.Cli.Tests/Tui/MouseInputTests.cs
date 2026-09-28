using System;
using Oahu.Cli.Tui.Shell;
using Oahu.Cli.Tui.Widgets;
using Xunit;

namespace Oahu.Cli.Tests.Tui;

public class MouseInputTests
{
    private static Func<char?> Feed(string characters)
    {
        var index = 0;
        return () => index >= characters.Length ? null : characters[index++];
    }

    [Fact]
    public void Parses_Wheel_Up()
    {
        Assert.True(SgrMouseParser.TryParse(Feed("64;10;5M"), out var mouseEvent));
        Assert.NotNull(mouseEvent);
        Assert.Equal(MouseEventKind.WheelUp, mouseEvent.Value.Kind);
        Assert.Equal(9, mouseEvent.Value.X);
        Assert.Equal(4, mouseEvent.Value.Y);
    }

    [Fact]
    public void Parses_Wheel_Down()
    {
        Assert.True(SgrMouseParser.TryParse(Feed("65;1;1M"), out var mouseEvent));
        Assert.Equal(MouseEventKind.WheelDown, mouseEvent!.Value.Kind);
        Assert.Equal(0, mouseEvent.Value.X);
        Assert.Equal(0, mouseEvent.Value.Y);
    }

    [Fact]
    public void Parses_Left_Click_Press()
    {
        Assert.True(SgrMouseParser.TryParse(Feed("0;3;2M"), out var mouseEvent));
        Assert.Equal(MouseEventKind.Click, mouseEvent!.Value.Kind);
        Assert.Equal(2, mouseEvent.Value.X);
        Assert.Equal(1, mouseEvent.Value.Y);
    }

    [Fact]
    public void Release_Is_Consumed_Without_Event()
    {
        Assert.True(SgrMouseParser.TryParse(Feed("0;3;2m"), out var mouseEvent));
        Assert.Null(mouseEvent);
    }

    [Fact]
    public void Drag_Is_Consumed_Without_Event()
    {
        Assert.True(SgrMouseParser.TryParse(Feed("32;3;2M"), out var mouseEvent));
        Assert.Null(mouseEvent);
    }

    [Fact]
    public void Right_Button_Is_Consumed_Without_Event()
    {
        Assert.True(SgrMouseParser.TryParse(Feed("2;3;2M"), out var mouseEvent));
        Assert.Null(mouseEvent);
    }

    [Fact]
    public void Truncated_Sequence_Fails()
    {
        Assert.False(SgrMouseParser.TryParse(Feed("0;3"), out var mouseEvent));
        Assert.Null(mouseEvent);
    }

    [Fact]
    public void Garbage_Fails()
    {
        Assert.False(SgrMouseParser.TryParse(Feed("x"), out var mouseEvent));
        Assert.Null(mouseEvent);
    }

    [Fact]
    public void TabStrip_HitTest_Maps_Columns_To_Tabs()
    {
        var strip = new TabStrip
        {
            Titles = new[] { "Home", "Library", "Queue" },
            ActiveIndex = 0,
        };
        Assert.Equal(0, strip.HitTest(0));
        Assert.Equal(0, strip.HitTest(7));
        Assert.Equal(1, strip.HitTest(9));
        Assert.Equal(1, strip.HitTest(19));
        Assert.Equal(2, strip.HitTest(21));
        Assert.Equal(-1, strip.HitTest(-1));
        Assert.Equal(-1, strip.HitTest(500));
    }
}
