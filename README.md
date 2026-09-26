<p align="center">
  <img src="assets/repository-banner.jpg" alt="Conversation lines becoming export documents, with a mint repair stitch on an indigo background." width="100%">
</p>

# ChatGPT Exporter · Repair Fork

**Keep conversations portable. Keep the exporter working.**

[![TypeScript](https://img.shields.io/badge/TypeScript-source-3178c6?style=flat-square)](src/) [![MIT license](https://img.shields.io/badge/License-MIT-6ac9aa?style=flat-square)](LICENSE) [![Windows and macOS builds](https://img.shields.io/badge/Download-Windows%20%C2%B7%20macOS-6ac9aa?style=flat-square)](https://github.com/tyhallcsu/chatgpt-exporter-fix/releases/latest) [![Userscript](https://img.shields.io/badge/Install-Tampermonkey-59636e?style=flat-square)](#userscript-only)

[Download](https://github.com/tyhallcsu/chatgpt-exporter-fix/releases/latest) · [Install this fork](#install-this-fork) · [What this fork adds](#what-this-fork-adds) · [Formats](#-supported-formats) · [Examples](#-example) · [Batch export](#-export-multiple-conversations) · [Development](#development)

This fork of [pionxzh/chatgpt-exporter](https://github.com/pionxzh/chatgpt-exporter) tracks upstream **v2.36.2** and adds Windows and macOS installers for the userscript, plus upstream [PR #400](https://github.com/pionxzh/chatgpt-exporter/pull/400)'s conversation-list error handling. The userscript exports conversations as text, HTML, Markdown, PNG, or JSON; batch export also supports JSON ZIP.

This fork previously carried its own navigation, conversation-detection and theme repairs. Upstream shipped equivalent fixes in v2.36.2, so those private versions were dropped rather than maintained in parallel — see [`docs/2.36.2-reconciliation.md`](docs/2.36.2-reconciliation.md).

## Install this fork

### Desktop installer

Windows and macOS builds are on the [**Releases page**](https://github.com/tyhallcsu/chatgpt-exporter-fix/releases/latest).

| You have | Download |
| --- | --- |
| **Windows** 10 / 11 | `ChatGPT-Exporter-Setup-<version>-windows-x64.exe` |
| Windows, no install wanted | `ChatGPT-Exporter-Portable-<version>-windows-x64.exe` |
| Windows, managed deployment | `ChatGPT-Exporter-<version>-windows-x64.msi` |
| **macOS** 10.15+, any Mac | `ChatGPT-Exporter-<version>-macos-universal.dmg` |

The desktop app is an **installer, not a ChatGPT client**. It carries a verified copy of the userscript, shows you its version and SHA-256, and hands it to your userscript manager — the exporter still runs as a userscript in your own browser. It reads no browser profile, cookie store or session.

These builds are **not code-signed**, so macOS Gatekeeper and Windows SmartScreen will both ask before the first launch. Check your download against `SHA256SUMS.txt` on the release first. How signing gets turned on later is in [`docs/desktop-release-design.md`](docs/desktop-release-design.md); what the app itself does is in [`desktop/README.md`](desktop/README.md).

### Userscript only

Fully supported, and nothing about the desktop helper is required.

1. Install Tampermonkey using the [browser links below](#prerequisites).
2. Download `chatgpt-exporter-<version>.user.js` from the [Releases page](https://github.com/tyhallcsu/chatgpt-exporter-fix/releases/latest), or [dist/chatgpt.user.js](dist/chatgpt.user.js) from this branch.
3. Disable or remove any older ChatGPT Exporter installation to avoid two copies mounting at once.
4. In Tampermonkey, open **Dashboard → Utilities → Import from file** and choose the file.
5. Reload ChatGPT. Look for **Export** in the sidebar or its icon in the collapsed rail.

> **Which code is in the release?** `master` is it. The artifacts published in [desktop-v2.36.2.1](https://github.com/tyhallcsu/chatgpt-exporter-fix/releases/tag/desktop-v2.36.2.1) are built from this source — upstream v2.36.2 plus upstream [PR #400](https://github.com/pionxzh/chatgpt-exporter/pull/400), and nothing else. The tracked [`dist/chatgpt.user.js`](dist/chatgpt.user.js) is the same bytes as the release's `chatgpt-exporter-2.36.2.user.js`, SHA-256 `9daa710bc102bb5dc62f574958581efd2029ea68cd5f6fb60ac7d3bfe8475f93`, reproduced independently on Ubuntu, macOS and Windows.

The upstream GreasyFork and raw-GitHub links below install the upstream version, not this fork's builds.

## What this fork adds

| Area | Implementation / evidence |
|---|---|
| Conversation-list errors surfaced in Export All | [`src/ui/ExportDialog.tsx`](src/ui/ExportDialog.tsx) · [tests](tests/export-dialog-list-load.test.tsx) |
| Windows and macOS installers | [`desktop/`](desktop/) · [packaging design](docs/desktop-release-design.md) |
| What was dropped, and why | [reconciliation notes](docs/2.36.2-reconciliation.md) · [upstream comparison](docs/upstream-comparison.md) |
| What was verified, and how | [verification matrix](docs/verification-matrix.md) |

Everything else is upstream v2.36.2 unmodified. The only source difference from
upstream's `userscript-v2.36.2` tag is PR #400's error handling in `src/api.ts`
and `src/ui/ExportDialog.tsx`, with its tests. Upstream merged PR #400 on
2026-09-26; this fork carries it ahead of the upstream release that will contain
it.

Known limitations: very long PNG exports can exceed renderer limits, and API rate
limits can delay the conversation list — which is what PR #400 makes visible
instead of showing a silently short list. The examples and screenshots below are
inherited upstream material, not new captures of this fork.

## Development

Use the pinned **pnpm 8.14.1** and a Node version compatible with the checked-in dependencies (the package declares Node >=20). See [CONTRIBUTING.md](CONTRIBUTING.md) for setup details, and [`docs/2.36.2-reconciliation.md`](docs/2.36.2-reconciliation.md) for how this branch relates to upstream.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
```

`pnpm test` runs TypeScript checking and Vitest. The build writes the tracked `dist/chatgpt.user.js`; source changes should include a rebuilt bundle. Presentation-only edits do not require replacing that bundle.

## Upstream project and installation


<div align="center">

A GreasyFork script to export the chat history of [ChatGPT](https://chatgpt.com/).

[![license][license-image]][license-url]
[![Upstream release][release-image]][release-url]
[![GreasyFork][GreasyFork-image]][GreasyFork-url]

[license-image]: https://img.shields.io/github/license/pionxzh/chatgpt-exporter?color=red
[license-url]: https://github.com/pionxzh/chatgpt-exporter/blob/master/LICENSE
[release-image]: https://img.shields.io/github/v/release/pionxzh/chatgpt-exporter?color=blue
[release-url]: https://github.com/pionxzh/chatgpt-exporter/releases/latest
[GreasyFork-image]: https://img.shields.io/static/v1?label=%20&message=GreasyFork&style=flat-square&labelColor=7B0000&color=960000&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3ggEBCQHM3fXsAAAAVdJREFUOMudkz2qwkAUhc/goBaGJBgUtBCZyj0ILkpwAW7Bws4yO3AHLiCtEFD8KVREkoiFxZzX5A2KGfN4F04zMN+ce+5c4LMUgDmANYBnrnV+plBSi+FwyHq9TgA2LQpvCiEiABwMBtzv95RSfoNEHy8DYBzHrNVqVEr9BWKcqNFoxF6vx3a7zc1mYyC73a4MogBg7vs+z+czO50OW60Wt9stK5UKp9Mpj8cjq9WqDTBHnjAdxzGQZrPJw+HA31oulzbAWgLoA0CWZVBKIY5jzGYzdLtdE9DlcrFNrY98zobqOA6TJKHW2jg4nU5sNBpFDp6mhVe5rsvVasUwDHm9Xqm15u12o+/7Hy0gD8KatOd5vN/v1FozTVN6nkchxFuI6hsAAIMg4OPxMJCXdtTbR7JJCMEgCJhlGUlyPB4XfumozInrupxMJpRSRtZlKoNYl+m/6/wDuWAjtPfsQuwAAAAASUVORK5CYII=
[GreasyFork-url]: https://greasyfork.org/scripts/456055-chatgpt-exporter

English &nbsp;&nbsp;|&nbsp;&nbsp; [Français](./README_FR.md) &nbsp;&nbsp;|&nbsp;&nbsp; [Indonesia](./README_ID.md) &nbsp;&nbsp;|&nbsp;&nbsp; [한국어](./README_KR.md) &nbsp;&nbsp;|&nbsp;&nbsp; [Türkçe](./README_TR.md)

![Upstream exporter preview](https://github.com/pionxzh/chatgpt-exporter/assets/9910706/1c864670-7912-4484-b4be-bdf5dde51557)

### Upstream install

### Prerequisites

<align>Install <b>`Tampermonkey`</b></align>

[<img src="https://user-images.githubusercontent.com/3750161/214147732-c75e96a4-48a4-4b64-b407-c2402e899a75.PNG" height="60" alt="Chrome" valign="middle">][link-chrome] &nbsp;&nbsp; [<img src="https://user-images.githubusercontent.com/3750161/214148610-acdef778-753e-470e-8765-6cc97bca85ed.png" height="60" alt="Firefox" valign="middle">][link-firefox] &nbsp;&nbsp; [<img src="https://user-images.githubusercontent.com/3750161/233201810-d1026855-0482-44c8-b1ec-c7247134473e.png" height="60" alt="Chrome" valign="middle">][link-edge]

[link-chrome]: https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo 'Chrome Web Store'
[link-firefox]: https://addons.mozilla.org/firefox/addon/tampermonkey 'Firefox Add-ons'
[link-edge]: https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd 'Edge Add-ons'

### Upstream UserScript

| Greasyfork                                                                        | GitHub                                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [![Install][Install-1-image]][install-1-url] | [![Install][Install-2-image]][install-2-url] |

[Install-1-image]: https://img.shields.io/badge/-Install-blue
[Install-1-url]: https://greasyfork.org/scripts/456055-chatgpt-exporter
[Install-2-image]: https://img.shields.io/badge/-Install-blue
[Install-2-url]: https://raw.githubusercontent.com/pionxzh/chatgpt-exporter/master/dist/chatgpt.user.js

> Make sure that the [`Allow User Scripts` is enabled](https://www.tampermonkey.net/faq.php?q=Q209) in your browser settings for Tampermonkey.

---

[📚 Supported Formats](#-supported-formats) &nbsp;&nbsp;|&nbsp;&nbsp; [💡 Example](#-example) &nbsp;&nbsp;|&nbsp;&nbsp; [📤 Export Multiple Conversations](#-export-multiple-conversations) &nbsp;&nbsp;|&nbsp;&nbsp; [🤝 Contribution](#-contribution) &nbsp;&nbsp;|&nbsp;&nbsp; [⭐ Star History](#-star-history)

</div>

---

## 📚 Supported Formats

- [Text](#text)
- [HTML](#html)
- [Markdown](#markdown)
- [PNG](#screenshot)
- [JSON](#json)

## 💡 Example

### Text

```
You:
I'm creating a ChatGPT Exporter. What do you think?

ChatGPT:
It sounds like you're planning on creating a tool that uses the ChatGPT model
to export text. ChatGPT is a large language model trained by OpenAI that is
designed to generate human-like text responses based on a given input. It can
be used for a variety of applications, such as chatbots, automated responses
to customer inquiries, and more.

However, please keep in mind that as a large language model, ChatGPT has not
been specifically trained for any specific task, so the quality of the
generated text will depend on how it is used and the context in which it is
applied. It's important to use ChatGPT responsibly and consider the potential
consequences of using it in any given situation.
```

### HTML

<div align="center">

<img width="643" alt="Upstream HTML export example" src="https://github.com/pionxzh/chatgpt-exporter/assets/9910706/47481c7a-4a6a-433b-b08e-fdf3bbabcb64">

</div>

### Markdown

```
---
title: ChatGPT Exporter Creation
source: https://chat.openai.com/c/cf3f8850-1d69-43c8-b99b-affd0de4e76f
author: ChatGPT
---

# ChatGPT Exporter Creation

#### You:
I'm creating a ChatGPT Exporter. What do you think?

#### ChatGPT:
It sounds like you're planning on creating a tool that uses the ChatGPT model to export text. ChatGPT is a large language model trained by OpenAI that is designed to generate human-like text responses based on a given input. It can be used for a variety of applications, such as chatbots, automated responses to customer inquiries, and more.
```

### Screenshot

<div align="center">
<img width="480" alt="Upstream PNG export example" src="https://user-images.githubusercontent.com/9910706/205663680-6ac97fac-39b0-495c-bee4-8ef37713a9ae.png" />

</div>

### JSON

the raw content from API `https://chat.openai.com/backend-api/conversation/[id]`

<details>
<summary>Click to see</summary>

```json
{
    "id": "35a1fa05-e928-4c39-8ffa-ca74f75b509f",
    "title": "AI Turing Test.",
    "create_time": 1678015311.655875,
    "mapping": {
        "5c48fa3e-e4ee-4d00-aa66-8fbcb671a358": {
            "id": "5c48fa3e-e4ee-4d00-aa66-8fbcb671a358",
            "message": {
                "id": "5c48fa3e-e4ee-4d00-aa66-8fbcb671a358",
                "author": {
                    "role": "system",
                    "metadata": {}
                },
                "create_time": 1678015311.655875,
                "content": {
                    "content_type": "text",
                    "parts": [
                        ""
                    ]
                },
                "end_turn": true,
                "weight": 1,
                "metadata": {},
                "recipient": "all"
            },
            "parent": "9310b90f-d8f0-4be6-bac2-daacddac784f",
            "children": [
                "4afb9720-3a88-49b1-9309-e2b53d607f34"
            ]
        },
        "9310b90f-d8f0-4be6-bac2-daacddac784f": {
            "id": "9310b90f-d8f0-4be6-bac2-daacddac784f",
            "children": [
                "5c48fa3e-e4ee-4d00-aa66-8fbcb671a358"
            ]
        },
        "4afb9720-3a88-49b1-9309-e2b53d607f34": {
            "id": "4afb9720-3a88-49b1-9309-e2b53d607f34",
            "message": {
                "id": "4afb9720-3a88-49b1-9309-e2b53d607f34",
                "author": {
                    "role": "user",
                    "metadata": {}
                },
                "create_time": 1678015311.656259,
                "content": {
                    "content_type": "text",
                    "parts": [
                        "write an poem about the Turing test"
                    ]
                },
                "weight": 1,
                "metadata": {
                    "timestamp_": "absolute"
                },
                "recipient": "all"
            },
            "parent": "5c48fa3e-e4ee-4d00-aa66-8fbcb671a358",
            "children": [
                "7027f1a5-8bd5-4463-9869-8a1d1db2f9a1"
            ]
        },
        "7027f1a5-8bd5-4463-9869-8a1d1db2f9a1": {
            "id": "7027f1a5-8bd5-4463-9869-8a1d1db2f9a1",
            "message": {
                "id": "7027f1a5-8bd5-4463-9869-8a1d1db2f9a1",
                "author": {
                    "role": "assistant",
                    "metadata": {}
                },
                "create_time": 1678185638.890551,
                "content": {
                    "content_type": "text",
                    "parts": [
                        "In the realm of machines and code,\nThere lies a test, with rules bestowed,\nA challenge to determine true mind,\nAnd if a machine's intelligence can find.\n\nThe Turing test, named for its creator,\nSeeks to find if a machine's behavior\nCan mimic that of a human so well,\nThat it's indistinguishable, can you tell?\n\nThrough conversations, the test is done,\nWith a judge and a machine, the game is run,\nIf the judge can't tell who is who,\nThen the machine's intelligence shines through.\n\nBut can a machine truly think?\nOr is it just a clever bit of link,\nBetween algorithms and programming code,\nCan it truly understand and decode?\n\nThe Turing test, a thought experiment,\nBrings up questions, doubts, and sentiment,\nFor as we strive to create machines smart,\nWe wonder, will they ever truly have heart?\n\nSo let us ponder and explore,\nAs we create machines more and more,\nThe Turing test a reminder to be,\nMindful of what our machines can truly see."
                    ]
                },
                "end_turn": false,
                "weight": 1,
                "metadata": {
                    "model_slug": "text-davinci-002-render-sha",
                    "finish_details": {
                        "type": "stop"
                    },
                    "timestamp_": "absolute"
                },
                "recipient": "all"
            },
            "parent": "4afb9720-3a88-49b1-9309-e2b53d607f34",
            "children": []
        }
    },
    "moderation_results": [],
    "current_node": "7027f1a5-8bd5-4463-9869-8a1d1db2f9a1"
}
```
</details>

## 📤 Export Multiple Conversations

When you click the "Export All" button, the **Export Conversations** dialog pops up. Here are the functions you can access.

**Export from official export file (conversations.json)**

Click the upload icon button to upload a JSON file of conversations, such as one downloaded from OpenAI.

**Export from API**

In the list of all your conversations, select which conversations you want to export. Check the "Select All" checkbox to export all your conversations.

Select your export format from the dropdown on the bottom left. You can choose from the following formats.

- **Markdown**
- **HTML**
- **JSON**
- **JSON (ZIP)**

Click the button to perform the action you want.

- **Archive** -  Archived chat sessions will disappear from the sidebar and can be managed in ChatGPT settings. See [#199](https://github.com/pionxzh/chatgpt-exporter/issues/199) for more details.
- **Delete** - Deletes the selected conversations.
- **Export** - Exports the selected conversations in the format chosen using the format selector.

## 💬 Using DeepSeek too?

Check out [**DeepSeek Exporter**](https://github.com/pionxzh/deepseek-exporter) — the sister project that brings the same one-click export to [DeepSeek](https://chat.deepseek.com/), including DeepThink reasoning and web-search sources.

## 🤝 Contribution

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## ⭐ Star History

Upstream project history: `pionxzh/chatgpt-exporter`.

<div align="center">

<img src="https://star-history.dera.page/svg?repos=pionxzh/chatgpt-exporter&type=Date" width="600" height="400" alt="Star History Chart" valign="middle">

</div>
