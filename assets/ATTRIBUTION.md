# Film artwork

Cinefern code is AGPL-3.0-or-later. The bundled film artwork has its own licenses.
Files are distributed unchanged; the interface scales and crops them for display.
Cinefern is not endorsed by the filmmakers.

| File                | Credit and source                                                                                                                    | License                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| sintel-poster.jpg   | © Blender Foundation, durian.blender.org. [Original poster](https://commons.wikimedia.org/wiki/File:Sintel_poster.jpg)               | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| sintel-backdrop.jpg | © Blender Foundation, www.sintel.org. [Original still](https://commons.wikimedia.org/wiki/File:Sintel-screenshot-1.jpg)              | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| bunny-poster.jpg    | © Blender Foundation, www.bigbuckbunny.org. [Original poster](https://commons.wikimedia.org/wiki/File:Big_buck_bunny_poster_big.jpg) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| elephants-dream.jpg | © Blender Foundation / Orange Open Movie Project. [Original cover](https://download.blender.org/ED/cover.jpg)                        | [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/) |
| tears-of-steel.jpg  | © Blender Foundation, mango.blender.org. [Original still](https://commons.wikimedia.org/wiki/File:Tears_of_Steel_frame_03_2e.jpg)    | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |

The Cinefern app icon (`icon.png`, `icon.icns`, and `icon.ico`) was created with the built-in OpenAI image generation tool for this project. The generation brief is recorded in `icon-prompt.txt`; `npm run icons:build` rebuilds desktop containers from the opaque 1024px PNG on macOS. iOS applies the icon's rounded mask at runtime.
Lucide icons are provided under the ISC license. The native iOS interface also uses Apple's system SF Symbols through `expo-symbols` and the native tab bar.
Apple TV's icon layers and top-shelf artwork package the same generated master with vector backgrounds and the Cinefern wordmark through `scripts/tv-assets.mjs`.
Open Cinema links to full films and an official Sintel trailer on public media servers. It does not package the films.
