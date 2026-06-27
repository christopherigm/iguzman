import type { AudioFormatCode, HdrFormatCode } from "@/lib/catalog";

// Each selectable disc audio / HDR format renders as a multi-select text Button
// in the metadata forms and the catalog filter row. The labels are brand names
// (Dolby Atmos, DTS:X, …) that are not localized, so they live here as static
// strings rather than i18n keys - only the section heading above the button row
// is translated. The `value` codes mirror the backend's controlled vocabulary
// (catalog/vocab.py) so a selection round-trips through the API unchanged.
//
// `icon` is the optional brand glyph the catalog filter renders beside the
// label: the Dolby logo for every Dolby audio format, the DTS logo for every
// DTS format, and the HDR badge for every dynamic-range format (Dolby Vision
// included). LPCM / Other / SDR carry no brand mark. The metadata forms render
// label-only and simply ignore this field.

export const AUDIO_FORMAT_BUTTONS: {
  value: AudioFormatCode;
  label: string;
  icon?: string;
}[] = [
  { value: "atmos", label: "Dolby Atmos", icon: "/icons/dolby.svg" },
  { value: "truehd", label: "Dolby TrueHD", icon: "/icons/dolby.svg" },
  { value: "ddplus", label: "Dolby Digital Plus", icon: "/icons/dolby.svg" },
  { value: "dd", label: "Dolby Digital", icon: "/icons/dolby.svg" },
  { value: "dtsx", label: "DTS:X", icon: "/icons/dts.svg" },
  { value: "dtshd", label: "DTS-HD MA", icon: "/icons/dts.svg" },
  { value: "dts", label: "DTS", icon: "/icons/dts.svg" },
  { value: "lpcm", label: "LPCM" },
  { value: "other", label: "Other" },
];

export const HDR_FORMAT_BUTTONS: {
  value: HdrFormatCode;
  label: string;
  icon?: string;
}[] = [
  { value: "dolbyvision", label: "Dolby Vision", icon: "/icons/hdr.svg" },
  { value: "hdr10plus", label: "HDR10+", icon: "/icons/hdr.svg" },
  { value: "hdr10", label: "HDR10", icon: "/icons/hdr.svg" },
  { value: "hlg", label: "HLG", icon: "/icons/hdr.svg" },
  { value: "sdr", label: "SDR" },
];
