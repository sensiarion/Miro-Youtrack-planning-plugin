# Icon Guide

## Icon Files

The project includes an SVG icon at `src/assets/icon.svg` that represents the integration between YouTrack and Miro.

## Icon Design

The icon features:
- **Board Background**: White canvas representing a Miro board
- **Task Cards**: Four colored cards representing YouTrack issues:
  - Yellow: Planning/Todo states
  - Green: In Work states  
  - Purple: Done states
- **Connectors**: Lines showing relationships between tasks:
  - Dotted lines for regular links
  - Solid arrows for dependencies
- **Brand Elements**: Simplified representations of YouTrack (checkmark) and Miro (wave)

## Converting to PNG

For Miro app submission, you'll need PNG versions of the icon:

### Using ImageMagick (command line)
```bash
convert src/assets/icon.svg -resize 512x512 src/assets/icon-512.png
```

### Using Inkscape (command line)
```bash
inkscape src/assets/icon.svg --export-type=png --export-filename=src/assets/icon-512.png -w 512 -h 512
```

### Using Online Tools
- [CloudConvert](https://cloudconvert.com/svg-to-png)
- [Convertio](https://convertio.co/svg-png/)

## Required Sizes

Miro typically requires:
- **512x512px** for app icon
- **256x256px** for smaller displays
- **128x128px** for thumbnails

## Usage

The icon can be referenced in:
- `package.json` (if needed)
- Miro app settings
- Documentation
- Marketing materials
