import type { AudioFormatCode, HdrFormatCode } from "@/lib/catalog";

// Each selectable disc audio / HDR format renders as a multi-select text Button
// in the metadata forms. The labels are brand names (Dolby Atmos, DTS:X, …) that
// are not localized, so they live here as static strings rather than i18n keys -
// only the section heading above the button row is translated. The `value`
// codes mirror the backend's controlled vocabulary (catalog/vocab.py) so a
// selection round-trips through the API unchanged.

export const AUDIO_FORMAT_BUTTONS: { value: AudioFormatCode; label: string }[] =
  [
    { value: "atmos", label: "Dolby Atmos" },
    { value: "truehd", label: "Dolby TrueHD" },
    { value: "ddplus", label: "Dolby Digital Plus" },
    { value: "dd", label: "Dolby Digital" },
    { value: "dtsx", label: "DTS:X" },
    { value: "dtshd", label: "DTS-HD MA" },
    { value: "dts", label: "DTS" },
    { value: "lpcm", label: "LPCM" },
    { value: "other", label: "Other" },
  ];

export const HDR_FORMAT_BUTTONS: { value: HdrFormatCode; label: string }[] = [
  { value: "dolbyvision", label: "Dolby Vision" },
  { value: "hdr10plus", label: "HDR10+" },
  { value: "hdr10", label: "HDR10" },
  { value: "hlg", label: "HLG" },
  { value: "sdr", label: "SDR" },
];
