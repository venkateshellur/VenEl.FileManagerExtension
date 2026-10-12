# 📁 VenEl File Manager for VS Code & Cursor

<p align="center">
  <img src="media/logo.png" width="128" height="128" alt="VenEl File Manager Logo"/>
</p>

<p align="center">
  <strong>Bring native OS-style file exploration, card grid views, and instant split previews directly into your IDE.</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=venkateshellur.venel-filemanager"><img src="https://img.shields.io/visual-studio-marketplace/v/venkateshellur.venel-filemanager?style=flat-square&color=6c5ce7&label=VS%20Marketplace" alt="VS Marketplace"/></a>
  <a href="https://open-vsx.org/extension/venel/venel-filemanager"><img src="https://img.shields.io/open-vsx/v/venel/venel-filemanager?style=flat-square&color=2ecc71&label=Open%20VSX" alt="Open VSX"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"/></a>
</p>

---

## 🌟 Why VenEl File Manager?

Standard IDE file trees are built for project codebases, but they are clunky and limited when you need to explore system files, view image assets, navigate parent directories, or inspect multiple folders simultaneously.

**VenEl File Manager** embeds a full-featured, OS-grade file manager directly inside your editor:

* ⊞ **Modern Grid View by Default**: Browse folders and files with high-density, beautiful card layouts.
* 🧭 **Windows & Mac Dropdown Address Bar**: Navigate like Windows Explorer or Mac Finder—instantly jump to system drives (`C:\`, `/`), user roots (Home, Desktop, Documents), parent breadcrumbs, or direct subfolders with 1 click.
* 👁️ **Live Split Preview Pane**: Single-click any file to inspect code, markdown, logs, or image assets (`.png`, `.jpg`, `.svg`, `.webp`) in real-time without leaving your folder.
* 🔍 **Instant Real-Time Search**: Filter hundreds of files as fast as you can type—completely client-side with zero lag.
* 🚀 **Editor Tab or Activity Bar**: Launch from the custom Activity Bar icon on the left, click the Status Bar item, or run `VenEl: Open File Manager Tab`.

---

## 📸 Key Features

| Feature | Description |
| :--- | :--- |
| **Grid / List Toggle** | Switch seamlessly between rich visual card grids and detailed list views. |
| **Drive & Root Jump** | 1-click access to all physical drives, external volumes, and special OS folders. |
| **Folder Hierarchy** | Deep breadcrumb trail in the address bar dropdown for instant parent jumping. |
| **Rich Previews** | Embedded image visualizer and syntax-highlighted code viewer. |
| **Shared Engine** | Powered by the high-performance local `VenEl.MCP.FileManager` backend. |

---

## ⚡ Quick Start

### 1. Install Extension
Install **VenEl File Manager** directly from the **VS Code Marketplace** or **Open VSX Registry** (Cursor / Windsurf).

### 2. Start the Local VenEl Engine
The extension connects to the high-performance local VenEl engine running on port `5050`:

```bash
# If using AssistantMCP:
dotnet run --project src/VenEl.MCP.Server

# Or if using ModularMCP:
venel-modular-mcp
```

### 3. Open the Explorer
* Click the **VenEl File Manager** folder icon on your **Activity Bar** (left sidebar).
* Click **🚀 Open in Editor Tab**, or click `$(folder) VenEl Files` on the bottom Status Bar.
* Enjoy full-screen, lightning-fast file browsing!

---

## ⚙️ Configuration

Configure the extension via `Settings` (`Cmd+,` / `Ctrl+,`) search for `VenEl File Manager`:

* `venel.filemanager.serverUrl`: Port/URL of the local engine (default: `http://localhost:5050`).
* `venel.filemanager.showStatusBarItem`: Toggle the bottom status bar shortcut button (default: `true`).

---

## 🧩 Compatibility

Works seamlessly on:
* **Visual Studio Code** (Windows, macOS, Linux)
* **Cursor AI IDE**
* **Windsurf**
* **VSCodium**
* **Google Project IDX**

---

## 📄 License

MIT © [Venkatesh Ellur](https://github.com/venkateshellur)
