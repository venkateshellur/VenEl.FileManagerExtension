# 📁 VenEl File Manager for VS Code & Cursor

<p align="center">
  <img src="media/logo.png" width="128" height="128" alt="VenEl File Manager Logo"/>
</p>

<p align="center">
  <strong>Bring native OS-style file exploration, card grid views, and instant split previews directly into your IDE.</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=venkateshellur.venel-filemanager"><img src="https://img.shields.io/visual-studio-marketplace/v/venkateshellur.venel-filemanager?style=flat-square&color=6c5ce7&label=VS%20Marketplace" alt="VS Marketplace"/></a>
  <a href="https://open-vsx.org/extension/venkateshellur/venel-filemanager"><img src="https://img.shields.io/open-vsx/v/venkateshellur/venel-filemanager?style=flat-square&color=2ecc71&label=Open%20VSX" alt="Open VSX"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Custom_MIT-blue?style=flat-square" alt="License"/></a>
</p>

---

## 🌟 Why VenEl File Manager?

Standard IDE file trees are built for project codebases, but they are clunky and limited when you need to explore system files, view image assets, navigate parent directories, or inspect multiple folders simultaneously.

**VenEl File Manager** embeds a full-featured, OS-grade file manager directly inside your editor:

* ⚡ **Zero-Touch Background Setup**: Spins up behind the scenes immediately upon extension install. Auto-detects and launches the high-performance local engine in the background (or uses embedded fallback engine) so clicking the icon is instantaneous with 0ms delay.
* ⊞ **Multi-View Engine**: Browse in **Details**, **List**, **Grid / Medium Icons**, **Large Icons**, or **Small Icons (Compact)**.
* 🤖 **Machine-Level Agent Search**: Blazingly fast system-wide search powered by macOS Spotlight (`mdfind`) and Windows search index with 1-click jump to containing folders.
* ↔️ **Draggable Resizable Splitters**: Adjust your Quick Access sidebar and Live Preview pane widths smoothly with mouse drag, double-click reset, and persistent memory.
* 🧭 **Windows & Mac Dropdown Address Bar**: Navigate like Windows Explorer or Mac Finder—instantly jump to system drives (`C:\`, `/`), user roots (Home, Desktop, Documents), parent breadcrumbs, or direct subfolders with 1 click.
* 👁️ **Live Split Preview Pane**: Single-click any file to inspect code, markdown, logs, or image assets (`.png`, `.jpg`, `.svg`, `.webp`) in real-time without leaving your folder.
* 🚀 **1-Click Direct Full-Screen Launch**: Clicking the Activity Bar icon directly opens the full File Manager editor tab and auto-collapses the narrow primary sidebar for a seamless 100% full-width view with zero intermediate clicks.
* 🌐 **Built-in Remote SFTP & SSH Explorer**: Connect directly to remote servers, VPS, cloud instances, and NAS storage with full in-editor browsing and remote editing.
* ⚡ **Norton/Total Commander Dual-Pane**: Two independent active directory panels with keyboard navigation, instant side-by-side comparison, and fast file movement.

---

## 📸 Key Features

| Feature | Description |
| :--- | :--- |
| **🌐 Remote SFTP & SSH Explorer** | Seamless remote file browsing, inline remote editing, and transfer progress monitoring. |
| **⚡ Commander Dual-Pane** | Norton/Total Commander split view for fast side-by-side folder management. |
| **ℹ️ About & System Diagnostics** | Dedicated modal showing running version, engine status pill, and 1-click clipboard diagnostics. |
| **Unified View Options** | Switch instantly between Details, List, Grid, Large Icons, and Small Icons. |
| **Machine Agent Search** | System-level indexed search via Spotlight/PowerShell with instant folder jump. |
| **⚖️ Visual File Diff** | Side-by-side split & unified line diffs between any two files or against Git HEAD. |
| **🖱️ Drag & Drop & Upload** | Drag to move/copy between folders/breadcrumbs/favorites + desktop upload overlay. |
| **🔍 Decompiler Search** | Real-time AST symbol search with exact line jump across .NET & Java binaries. |
| **🏷️ Smart Batch Renamer** | Find & replace, prefix/suffix, numbering, and case conversions with live preview. |
| **🗜️ Zip & Archive Tools** | 1-click compress to `.zip` and extraction for `.zip`, `.tar.gz`, `.tgz`, and `.tar`. |
| **🏢 Cloud Drive & OneDrive Support**| Native support for Windows OneDrive Commercial / Personal redirected special folders. |
| **🗑️ Safe Move to Trash** | All deletes safely move items to OS Trash / Recycle Bin with recovery support. |
| **Draggable Splitters** | Interactive splitters for custom sidebar and preview panel widths with persistence. |
| **Drive & Root Jump** | 1-click access to all physical drives, external volumes, and special OS folders. |
| **Folder Hierarchy** | Deep breadcrumb trail in the address bar dropdown for instant parent jumping. |
| **Rich Previews** | Live PDF canvas viewer, Excel workbooks, Word docs, CSV tables, images, and code. |
| **🎨 Dark & Light Themes** | Dedicated high-contrast color schemes matching both custom and editor native aesthetics. |
| **⚡ Multi-Tier Runtime** | Native .NET 8 / 9 / 10 Kestrel engine with automatic zero-dependency Node.js fallback. |

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

## 📬 Contact & Connect

Developed with ❤️ by **Venkatesh Ellur**.

* 💼 **LinkedIn:** [linkedin.com/in/venkateshellur](https://www.linkedin.com/in/venkateshellur/)
* 🐙 **GitHub:** [@venkateshellur](https://github.com/venkateshellur)
* 💡 **Issues & Feedback:** [GitHub Issues](https://github.com/venkateshellur/VenEl.FileManagerExtension/issues)

Feel free to connect on LinkedIn for collaborations, questions, or feedback!

---

## 📄 License

Custom MIT License (Free for Use & Distribution, No Commercial Resale) © [Venkatesh Ellur](https://www.linkedin.com/in/venkateshellur/) — see [LICENSE](LICENSE) for details.
