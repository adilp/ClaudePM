# NotchCenter - macOS Menu Bar App

## Overview

NotchCenter is a native macOS menu bar app that displays notifications from the center-top (notch area) with smart meeting timing and Claude PM integration.

## Tech Stack

- **Language**: Swift 5.9+
- **UI Framework**: SwiftUI
- **Minimum macOS**: 13.0 (Ventura)
- **Architecture**: Universal binary (Apple Silicon + Intel)
- **Dependencies**: DynamicNotchKit (SPM)

## Project Structure

```
apps/macos-notch/
├── NotchCenter.xcodeproj/          # Xcode project
└── NotchCenter/
    ├── App/
    │   └── NotchCenterApp.swift    # @main with MenuBarExtra
    ├── Assets.xcassets/
    │   └── AppIcon.appiconset/
    └── Info.plist                  # LSUIElement=true (no Dock icon)
```

## Build & Run

### Command Line

```bash
# Debug build (current architecture only)
xcodebuild -project NotchCenter.xcodeproj -scheme NotchCenter -configuration Debug build

# Release build (universal binary)
xcodebuild -project NotchCenter.xcodeproj -scheme NotchCenter -configuration Release -destination "generic/platform=macOS" build

# Run the app
open ~/Library/Developer/Xcode/DerivedData/NotchCenter-*/Build/Products/Release/NotchCenter.app
```

### Xcode

```bash
open NotchCenter.xcodeproj
```

Then press Cmd+R to build and run.

## Key Features

- **Menu Bar Presence**: Bell icon appears in macOS menu bar
- **No Dock Icon**: `LSUIElement=true` hides from Dock and Cmd+Tab
- **SwiftUI MenuBarExtra**: Native macOS 13+ menu bar API
- **DynamicNotchKit Ready**: SPM dependency for future notch notifications

## Configuration

### Info.plist

| Key | Value | Purpose |
|-----|-------|---------|
| `LSUIElement` | `true` | Hide from Dock/Cmd+Tab |
| `CFBundleIdentifier` | `com.claudepm.notchcenter` | Bundle ID |

### Build Settings

| Setting | Value |
|---------|-------|
| Deployment Target | macOS 13.0 |
| Architectures (Release) | `arm64 x86_64` |
| ONLY_ACTIVE_ARCH (Release) | NO |
| Code Signing | Sign to Run Locally |

## Dependencies

| Package | Version | Source |
|---------|---------|--------|
| DynamicNotchKit | 1.0.0+ | https://github.com/MrKai77/DynamicNotchKit |

## Related Documents

- [PRD](../../docs/plans/notch-center-prd.md) - Product Requirements
- [Design Doc](../../docs/plans/notch-center-design.md) - Technical Design
- [Tickets](../../docs/jira-tickets/notch-center/README.md) - Implementation Tickets
