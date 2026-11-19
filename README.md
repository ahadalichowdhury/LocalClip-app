# 📋 LocalClip

<div align="center">

![LocalClip Logo](assets/app.png)

**A modern, Windows 11-inspired clipboard manager with local storage and privacy-first design**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2-blue)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18.2.0-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.2-blue)](https://www.typescriptlang.org/)

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Development](#-development) • [Contributing](#-contributing)

</div>

## 🌟 Features

### 📋 **Smart Clipboard Management**

- **Real-time monitoring** of system clipboard with persistent history
- **Multi-format support**: Text, Images, Files, HTML, RTF
- **Intelligent categorization** with auto-detection
- **Duplicate detection** and smart merging
- **Pin important items** for quick access

### 🔍 **Powerful Search & Filter**

- **Instant search** with fuzzy matching
- **Content type filtering** (Text, Images, Files, URLs, Code)
- **Date range filters** (Today, Week, Month, Custom)
- **Source application filtering**
- **Advanced search** with regex support

### 🎨 **Modern Windows 11-Inspired UI**

- **Fluent Design** with acrylic blur effects
- **Dynamic theming** (Light, Dark, Auto)
- **Responsive grid layout** (2-6 columns)
- **Smooth animations** and transitions
- **Accessibility compliant** (WCAG 2.1 AA)

### ⚡ **System Integration**

- **Global hotkeys** for quick access (`Ctrl/Cmd + Shift + V`)
- **System tray integration** with context menu
- **Auto-start on system boot** (optional)
- **Cross-platform support** (Windows, macOS, Linux)

### 🔒 **Privacy & Security**

- **Local storage only** - no cloud sync
- **Excluded apps** configuration
- **Incognito mode** for sensitive operations
- **Auto-cleanup** with configurable retention
- **Optional data encryption**

### 📊 **Advanced Features**

- **Usage analytics** and statistics
- **Export/Import** clipboard history
- **Bulk operations** (delete, categorize)
- **Keyboard shortcuts** for power users
- **Plugin system** for extensibility

## 🚀 Installation

### Install on your Mac

LocalClip runs on **macOS 11 or later**, on both Apple Silicon (M1–M4) and
Intel Macs — there is one download for both.

#### 1. Download

Go to the [latest release](https://github.com/ahadalichowdhury/LocalClip-app/releases/latest)
and download **`LocalClip_<version>_universal.dmg`** (about 5 MB).

#### 2. Copy it to Applications

1. Double-click the downloaded `.dmg` file. A window opens with the
   **LocalClip** app and an **Applications** folder.
2. **Drag LocalClip onto the Applications folder.**
3. Eject the disk image (click ⏏ next to "LocalClip" in Finder's sidebar).

> Don't open LocalClip from inside the disk image window — macOS blocks apps
> run from there. Always open the copy in **Applications**.

#### 3. Open it the first time

LocalClip isn't notarized by Apple yet, so the first time you open it macOS
shows:

> **"LocalClip" can't be opened because Apple cannot check it for malicious software.**

Click **OK** (not "Move to Trash"), then use **one** of these ways — you only
have to do this once:

- **Right-click → Open:** in **Applications**, right-click (or Control-click)
  **LocalClip**, choose **Open**, then click **Open** in the dialog.
- **Open Anyway:** open **System Settings → Privacy & Security**, scroll down to
  *"LocalClip" was blocked to protect your Mac* and click **Open Anyway**, then
  **Open**. (On macOS 15 and later this is the only way without Terminal.)
- **Terminal:** run this, then open LocalClip normally:
  ```bash
  xattr -dr com.apple.quarantine /Applications/LocalClip.app
  ```

#### 4. Allow auto-paste (Accessibility)

LocalClip pastes into the app you were using by pressing ⌘V for you, which
macOS only allows after you give permission:

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Turn on **LocalClip** (use **+** to add it from Applications if it isn't listed).

Without this, picking a clip still copies it — just press ⌘V yourself.

#### 5. Use it

| Shortcut | What it does |
|---|---|
| **⌘⇧V** | Open / close the clipboard (works over fullscreen apps too) |
| **↑ ↓** then **↵** | Choose a clip and paste it |
| **⌘1 … ⌘9** | Paste the clip with that number |
| **⌘E** | Switch between Clipboard and Emoji |
| **⌘P** / **⌘⌫** | Pin / delete the selected clip |
| **esc** | Clear the search, then close |

- Screenshots you take (⌘⇧3, ⌘⇧4, ⌘⇧5) appear in the list and are copied,
  ready to paste. To make that instant, LocalClip turns off the small
  screenshot preview in the screen corner; turn it back on in
  ⌘⇧5 → **Options → Show Floating Thumbnail**.
- Change the shortcut, highlight colour, glass effect and more in **Settings**
  (the slider icon next to the search box). LocalClip also lives in the menu bar.

#### Updating

Download the new DMG and drag LocalClip into Applications again, choosing
**Replace**. Your history and settings are kept. You may need to repeat
step 3 once.

#### Uninstalling

Quit LocalClip from the menu bar icon, drag **LocalClip** from Applications to
the Trash, and (to remove your history too) delete
`~/Library/Application Support/com.localclip.app`.

#### Troubleshooting

- **Picking a clip doesn't paste** — check step 4. After an update, macOS may
  not recognise the new version: in **Accessibility**, select LocalClip, remove
  it with **−**, then add it again with **+**.
- **⌘⇧V does nothing** — another app may already use that shortcut. Open
  LocalClip from the menu bar icon → **Settings** and pick a different one.
- **"LocalClip is damaged and can't be opened"** — run the Terminal command
  from step 3.

### Publishing a release (maintainers)

Push a version tag; GitHub Actions (`.github/workflows/release.yml`) runs the
tests, builds a universal DMG and attaches it to a GitHub Release for that tag:

```bash
git tag v2.0.1
git push origin v2.0.1
```

The app version is taken from the tag. To ship a signed and notarized build,
add the repository secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`;
without them the app is ad-hoc signed.

### Build from Source

```bash
# Clone the repository
git clone https://github.com/ahadalichowdhury/LocalClip.git
cd LocalClip

# Install Rust (once): https://rustup.rs
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install dependencies
npm install

# Development mode (Vite + Rust backend with hot reload)
npm run dev

# Build LocalClip.app + .dmg (src-tauri/target/release/bundle/)
npm run build
```

> **Permissions:** auto-paste sends Cmd+V to the app you were using, which
> needs **System Settings → Privacy & Security → Accessibility** for LocalClip.
> Without it, the item is still copied and you can press Cmd+V yourself.

## 🎯 Usage

See **[Use it](#5-use-it)** above for the keyboard shortcuts.

### Settings

Open Settings from the slider icon next to the search box, or from the menu
bar icon → **Settings…**

- **Shortcut** to open LocalClip (default ⌘⇧V)
- **Save what I copy** — pause recording without quitting
- **Sort clips by kind** — Links, Code, Numbers, Images… filters
- **Keep the last 20–100 clips** (default 40); pinned clips are never removed
- **Highlight colour**, **Glass effect** with opacity, **Theme**, **Text size**
- **Open at login**, **Hide from Dock**

## 🛠️ Development

### Prerequisites

- **Node.js** ≥ 18.0.0
- **npm** ≥ 8.0.0
- **Rust** (stable, via rustup)
- **Xcode Command Line Tools** (`xcode-select --install`)

### Project Structure

```
LocalClip/
├── src-tauri/          # Rust backend (Tauri 2)
│   └── src/
│       ├── main.rs      # App setup, tray, hotkey, lifecycle
│       ├── window.rs    # Non-activating NSPanel (works over fullscreen apps)
│       ├── monitor.rs   # Clipboard watcher (NSPasteboard changeCount)
│       ├── classify.rs  # URL / email / number / code detection
│       ├── storage.rs   # JSON history (same format as the old Electron build)
│       ├── settings.rs  # Settings
│       ├── commands.rs  # IPC commands used by the UI
│       └── macos.rs     # AppKit / CoreGraphics helpers (pasteboard, Cmd+V)
├── src/
│   ├── renderer/       # React frontend (lib/nativeBridge.ts talks to Rust)
│   └── shared/         # Shared types and utilities
├── assets/             # Icons and resources
├── docs/               # Documentation
├── tests/              # Test files
└── scripts/            # Build and utility scripts
```

### Development Commands

```bash
# Start development server
npm run dev

# Run tests (Jest + cargo test)
npm test
npm run test:watch
npm run test:coverage

# Linting and formatting
npm run lint
npm run lint:fix
npm run format

# Type checking
npm run typecheck

# Build LocalClip.app + .dmg
npm run build
npm run build:universal  # Intel + Apple Silicon (needs both rustup targets)
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Rust, Tauri 2 (macOS)
- **State Management**: Zustand
- **Testing**: Jest, React Testing Library
- **Build**: Vite, Tauri CLI
- **UI Components**: Lucide React, Framer Motion

### Architecture

LocalClip follows a clean architecture pattern:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Renderer      │    │   Main Process  │    │   System APIs   │
│   (React UI)    │◄──►│  (Rust/Tauri)   │◄──►│ (NSPasteboard)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   State Store   │    │   Data Layer    │
│   (Zustand)     │    │   (SQLite)      │
└─────────────────┘    └─────────────────┘
```

## 📚 Documentation

- **[Setup Guide](docs/SETUP.md)** - Detailed installation and configuration
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing and development setup
- **[API Documentation](docs/API.md)** - Internal API reference
- **[Feature Specifications](docs/FEATURES.md)** - Detailed feature documentation

## 🔨 Build Guides

- **[📖 Complete Build Guide](docs/BUILD_GUIDE.md)** - Step-by-step instructions for all platforms
- **[⚡ Quick Build Reference](docs/QUICK_BUILD_REFERENCE.md)** - Copy-paste commands for quick builds
- **[✅ Release Checklist](docs/RELEASE_CHECKLIST.md)** - Pre-release testing and distribution checklist

### Platform-Specific Guides

- **[🪟 Windows FREE Build](README_FREE_BUILD.md)** - Build Windows .exe without certificates
- **[🐧 Linux Distribution](docs/LINUX_FREE_GUIDE.md)** - FREE Linux distribution options
- **[🆓 FREE Code Signing](docs/FREE_SIGNING.md)** - Alternatives to expensive certificates

### Quick Build Commands

```bash
# Build for all platforms (no signing)
npm run dist:unsigned

# Windows with self-signed certificate (FREE)
powershell -ExecutionPolicy Bypass -File scripts/create-self-signed-cert.ps1
npm run dist:win

# Linux store setup (FREE)
npm run setup:snap      # Snap Store
npm run setup:flatpak   # Flathub

# macOS
npm run dist:mac        # Current architecture
npm run dist:mac:universal  # Universal binary
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Contribution Steps

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Setup

```bash
# Fork and clone your fork
git clone https://github.com/YOUR_USERNAME/LocalClip.git
cd LocalClip

# Add upstream remote
git remote add upstream https://github.com/ahadalichowdhury/LocalClip.git

# Install dependencies
npm install

# Start development
npm run dev
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**S. M. Ahad Ali Chowdhury**

- Email: smahadalichowdhury@gmail.com
- GitHub: [@ahadalichowdhury](https://github.com/ahadalichowdhury)

## 🙏 Acknowledgments

- **Electron.js** team for the amazing framework
- **React** team for the powerful UI library
- **Windows 11** design team for inspiration
- **Open source community** for various libraries and tools

## 📊 Project Stats

![GitHub stars](https://img.shields.io/github/stars/ahadalichowdhury/LocalClip?style=social)
![GitHub forks](https://img.shields.io/github/forks/ahadalichowdhury/LocalClip?style=social)
![GitHub issues](https://img.shields.io/github/issues/ahadalichowdhury/LocalClip)
![GitHub pull requests](https://img.shields.io/github/issues-pr/ahadalichowdhury/LocalClip)

---

<div align="center">

**⭐ Star this repository if you find it helpful!**

[Report Bug](https://github.com/ahadalichowdhury/LocalClip/issues) • [Request Feature](https://github.com/ahadalichowdhury/LocalClip/issues) • [Discussions](https://github.com/ahadalichowdhury/LocalClip/discussions)

</div>
