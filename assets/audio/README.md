# Soundtrack source

`arcade_synthwave_seamless_loop_v2.wav` was supplied by the project owner. The original stereo 44.1 kHz source is retained here. Browser assets are independently encoded as Vorbis and MP3 in `web/public/audio`; Web Audio decodes the buffer once and loops 34.285714286 seconds without restarting an HTML audio element.

Initial levels are music 20% and effects 60%. Existing preferences are preserved. Music is attenuated during rallies and result jingles. Effects are synthesized separately and pass through a shared limiter. Source peak: −0.54 dBFS; source RMS: −12.89 dBFS. These source measurements are separate from browser output measurements.
