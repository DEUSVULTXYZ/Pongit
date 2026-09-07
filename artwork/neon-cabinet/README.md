# Neon Cabinet artwork

Original PONGIT decorations created for the September 2026 Neon Cabinet design. The transparent `sprites-source.png` was generated for this project using OpenAI ImageGen and retained as the editable master atlas. It contains eight columns of animation frames and four rows: miniature arcade cabinet, joystick, ringed planet and star. The objects are decorative, not inventory items or game rewards.

Run `node scripts/cabinet-assets.mjs` from the repository root to rebuild the compact transparent PNG strips in `web/public/art/pixels`. The preparation uses Sharp (provided by the installed Next.js toolchain), nearest-neighbour resampling and the original rest frame at the end of each sequence. Frames are 96 × 96 pixels, with eight frames per strip. CSS plays the frames during one second of a twelve-second cycle, with separate phases for the four decorations.

The original artwork brief used graphite metal, cyan/violet highlights, square-pixel shading and transparent padding. Each row represents the same stationary object: screen illumination for the cabinet, a small shaft movement for the joystick, a traveling ring highlight for the planet and a short star shimmer.

The existing pre-rendered room assets, `web/public/art/arcade-hall.webp` and its mobile counterpart, remain the background sources. The new appearance grades them using static CSS opacity, saturation and a central dark overlay. There is no animated background, parallax or additional scene renderer.
