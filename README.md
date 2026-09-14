# Stream Deck Plugin Library

## Introduction

I've decided to start building a custom Stream Deck plugin library around my day-to-day business tasks and needs. Why? Because I purchased a Stream Deck + XL thinking it was a good idea, but quickly realised the current landscape of plugins available around my needs was pretty small. Therefore, I decided to build a plugin library for day-to-day monitoring and utilities.

Each plugin has its own independent sub-folder where all the plugin files are stored, enabling the library to grow over time. Additionally, each plugin also has its own `README.md` file, where basic plugin details are found, for example installation and configuration guides.

This repository is public so others can clone, learn from, adapt, and contribute to these plugins.

The goal is to keep the repo useful, understandable, and easy to extend. These plugins are built around real workflows, so contributions should favour practical improvements over unnecessary complexity.
You are welcome to:

- Clone the repo and use the plugins locally.
- Fork the repo and customise plugins for your own setup.
- Open issues for bugs, missing documentation, or feature ideas.
- Open pull requests for fixes, improvements, or new plugins that fit the style of the library.

## Current Plugins

Below are the current plugins available - enjoy!

#### Cabin Analytics

![image](https://github.com/ChrisWatterston/streamdeck-plugin-library/var/assets/pligin-banner-cabin-analytics.jpg)

- [`cabin-analytics`](./cabin-analytics) - Display Cabin web analytics metrics on Stream Deck keys. [Cabin Analytics](https://withcabin.com/) is a lightweight, carbon-conscious Google Analytics alternative. No cookies, no consent banners, and 100% GDPR & CCPA compliant by design.

## Contributing

Contributions are welcome. A good pull request should:

- Keep one plugin per folder.
- Include or update that plugin's `README.md`.
- Avoid committing API keys, access tokens, private domains, personal analytics data, or other secrets.
- Keep settings configurable through the Stream Deck property inspector where possible.
- Use clear, practical comments where the code is likely to be tweaked later.
- Prefer small, focused changes over broad rewrites.
- Explain what changed and, where possible, how it was tested.

If you are adding a new plugin, please include:

- A short description of what it does.
- Installation notes.
- Configuration notes.
- Any external API or service requirements.
- A note about whether the plugin stores settings globally, per key, or both.

### Repository Structure

Each plugin should live in its own folder. Therefore please keep plugins self-contained. Shared tooling can be added later if it becomes genuinely useful, but the current preference is that someone can understand and install one plugin without needing to understand the whole repo.

### Rules And Guardrails

- Do not commit secrets. Use Stream Deck settings, local config, or environment-specific setup instead.
- Do not include private customer, client, analytics, or business data.
- Respect third-party API terms, rate limits, and branding rules.
- Keep dependencies minimal unless they clearly make the plugin easier to maintain.
- Keep generated or installed local files out of the repo unless they are part of the actual plugin source.
- Be kind and constructive in issues and pull requests.

## License

This project is licensed under the GNU General Public License v3.0. See [`LICENSE`](./LICENSE) for the full text.

In plain English: you can use, study, share, and modify the code, but if you distribute modified versions, they must remain under the same GPLv3 license terms. This summary is not legal advice; the license file is the source of truth.
