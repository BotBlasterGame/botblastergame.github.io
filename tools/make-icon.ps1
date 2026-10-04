# Draws the Bot Blaster icon and saves icon.png + icon.ico in the project root
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded dark-neon background
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 56
$path.AddArc(0, 0, $r, $r, 180, 90); $path.AddArc($size - $r - 1, 0, $r, $r, 270, 90)
$path.AddArc($size - $r - 1, $size - $r - 1, $r, $r, 0, 90); $path.AddArc(0, $size - $r - 1, $r, $r, 90, 90)
$path.CloseFigure()
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, $size), ([System.Drawing.Color]::FromArgb(40, 30, 90)), ([System.Drawing.Color]::FromArgb(10, 13, 26))
$g.FillPath($bg, $path)
$g.SetClip($path)

# Robot head
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(79, 124, 255))
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(35, 38, 47))
$red = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 51, 68))
$g.FillRectangle($dark, 124, 40, 8, 30)
$g.FillEllipse($red, 118, 28, 20, 20)
$g.FillRectangle($blue, 68, 70, 120, 110)
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 255, 255, 255))), 68, 70, 120, 16)
$g.FillRectangle($dark, 80, 108, 96, 34)
$g.FillRectangle($red, 88, 116, 80, 18)
$g.FillRectangle($dark, 58, 100, 10, 50); $g.FillRectangle($dark, 188, 100, 10, 50)
$g.FillRectangle($blue, 90, 180, 76, 40)

# Neon crosshair
$cyan = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(53, 224, 255)), 10
$g.DrawEllipse($cyan, 58, 55, 140, 140)
foreach ($seg in @(@(128, 30, 128, 70), @(128, 180, 128, 220), @(33, 125, 73, 125), @(183, 125, 223, 125))) {
  $g.DrawLine($cyan, $seg[0], $seg[1], $seg[2], $seg[3])
}

$g.Dispose()
$pngPath = Join-Path $root 'icon.png'
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# Wrap the PNG in an .ico container (PNG-compressed icons are supported since Windows Vista)
$png = [System.IO.File]::ReadAllBytes($pngPath)
$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ms
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0)
$w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$png.Length); $w.Write([UInt32]22)
$w.Write($png)
[System.IO.File]::WriteAllBytes((Join-Path $root 'icon.ico'), $ms.ToArray())
Write-Output "Icon written"
