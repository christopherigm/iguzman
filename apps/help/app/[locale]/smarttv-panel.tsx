import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { CodeBlock } from "@repo/ui/core-elements/code-block";

// ── Smart TV development constants ────────────────────────────────────────────

const TV_SCAFFOLD =
  "pnpm new-tv-app                                  # interactive wizard\n" +
  "bash cli/new-smarttv-app/new-smarttv-app.sh es   # same wizard, Spanish prompts";

const TV_DEV = "pnpm dev --filter=<app-name>";

// Build the static bundle and hand the dist/ folder to Tizen Studio (the
// monorepo app has no Tizen project metadata of its own beyond config.xml).
const TV_LINK =
  "pnpm build --filter=<app-name>                  # outputs apps/<app-name>/dist\n" +
  "cp config.xml icon.png .project .tproject dist/ # from apps/<app-name>: manifest, icon + Tizen project metadata\n" +
  "# Tizen Studio: File ▸ Import ▸ Tizen ▸ Tizen Project ▸ select dist/ ▸ profile tv-samsung";

// pnpm tv-cert wraps `tizen certificate` + `tizen security-profiles add`. It is
// emulator-only; physical TVs still need the Samsung distributor cert (DUID) from
// the Certificate Manager GUI described above.
const TV_CERT =
  "pnpm tv-cert                                     # interactive; emulator-only signing profile\n" +
  "# Physical TVs still need a Samsung distributor cert (DUID) via Certificate Manager (GUI above).";

// pnpm tv-build discovers Tizen apps, picks a signing profile, builds the bundle,
// copies the manifest into dist/ and runs `tizen package`.
const TV_PACKAGE =
  "pnpm tv-build                                    # interactive app + profile picker\n" +
  "pnpm tv-build <app-name>                         # skip the app picker\n" +
  "# Or by hand (equivalent to right-click ▸ Build Signed Package):\n" +
  "cd apps/<app-name>\n" +
  "tizen package -t wgt -s <cert-profile> -- dist";

// pnpm tv-deploy lists connected sdb targets, auto-builds the .wgt when missing,
// then installs and runs it.
const TV_EMULATOR_RUN =
  "pnpm tv-deploy                          # pick app + target; auto-builds the .wgt if missing\n" +
  "# Or by hand (equivalent to Run As ▸ Tizen Web Application):\n" +
  "sdb devices                             # note the emulator serial (e.g. emulator-26101)\n" +
  "tizen install -n dist/<App>.wgt -t emulator-26101\n" +
  "tizen run -p <app-id> -t emulator-26101 # app id = <pkg>.<App> from config.xml";

const TV_DEVICE_RUN =
  "pnpm tv-deploy                          # enter the TV IP when prompted if it isn't connected yet\n" +
  "# Or by hand (equivalent to Run As ▸ Tizen Web Application):\n" +
  "sdb connect <tv-ip>                     # e.g. sdb connect 192.168.1.10\n" +
  "sdb devices                             # confirm the TV is listed\n" +
  "tizen install -n dist/<App>.wgt -t <tv-device>\n" +
  "tizen run -p <app-id> -t <tv-device>    # app id = <pkg>.<App> from config.xml";

// Screenshots downloaded from developer.samsung.com (Samsung Smart TV docs),
// self-hosted under public/smarttv. Intrinsic pixel dimensions are required by
// next/image; display width is capped in <Screenshot>.
const IMG = {
  packageManager: {
    src: "/smarttv/package-manager-extension-sdk.png",
    width: 641,
    height: 650,
  },
  extensions: {
    src: "/smarttv/tv-extensions-list.png",
    width: 632,
    height: 650,
  },
  certManager: {
    src: "/smarttv/certificate-manager.png",
    width: 717,
    height: 155,
  },
  certSelectTv: {
    src: "/smarttv/certificate-select-tv.png",
    width: 684,
    height: 464,
  },
  emulatorCreate: {
    src: "/smarttv/emulator-create-instance.png",
    width: 675,
    height: 654,
  },
  emulatorLaunch: {
    src: "/smarttv/emulator-launch.png",
    width: 680,
    height: 656,
  },
  developerMode: {
    src: "/smarttv/tv-developer-mode.png",
    width: 1426,
    height: 811,
  },
} as const;

// Samsung Developer documentation pages referenced per step.
const DOC_INSTALL_SDK =
  "https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html";
const DOC_CERTIFICATES =
  "https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html";
const DOC_TV_DEVICE =
  "https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html";
const DOC_VS_CODE =
  "https://developer.samsung.com/smarttv/develop/tools/tizen-extension-for-vs-code.html";
const DOC_IMPORT =
  "https://developer.samsung.com/smarttv/develop/getting-started/creating-tv-applications/importing-tv-applications.html";

// ── Component ─────────────────────────────────────────────────────────────────

export async function SmartTvPanel() {
  const t = await getTranslations("HomePage");

  return (
    <>
      {/* 1 ─ Install the IDE, extensions, and certificate profile. */}
      <GroupLabel>{t("smartTvIdeGroup")}</GroupLabel>

      <StepSection
        heading={t("smartTvInstallIdeHeading")}
        description={t("smartTvInstallIdeDesc")}
        links={[{ label: t("smartTvInstallIdeLink"), href: DOC_INSTALL_SDK }]}
        images={[{ ...IMG.packageManager, alt: t("smartTvInstallIdeImgAlt") }]}
      />
      <StepSection
        heading={t("smartTvExtensionsHeading")}
        description={t("smartTvExtensionsDesc")}
        images={[{ ...IMG.extensions, alt: t("smartTvExtensionsImgAlt") }]}
      />
      <StepSection
        heading={t("smartTvCertHeading")}
        description={t("smartTvCertDesc")}
        links={[{ label: t("smartTvCertLink"), href: DOC_CERTIFICATES }]}
        code={TV_CERT}
        images={[
          { ...IMG.certManager, alt: t("smartTvCertManagerImgAlt") },
          { ...IMG.certSelectTv, alt: t("smartTvCertImgAlt") },
        ]}
      />
      <StepSection
        heading={t("smartTvVscodeHeading")}
        description={t("smartTvVscodeDesc")}
        links={[{ label: t("smartTvVscodeLink"), href: DOC_VS_CODE }]}
      />

      {/* 2 ─ Stand up the emulator and the real TV before there's an app. */}
      <GroupLabel marginTop={8}>{t("smartTvTargetsGroup")}</GroupLabel>

      <StepSection
        heading={t("smartTvCreateEmuHeading")}
        description={t("smartTvCreateEmuDesc")}
        images={[
          { ...IMG.emulatorCreate, alt: t("smartTvCreateEmuImgAlt") },
          { ...IMG.emulatorLaunch, alt: t("smartTvLaunchEmuImgAlt") },
        ]}
      />
      <StepSection
        heading={t("smartTvDevModeHeading")}
        description={t("smartTvDevModeDesc")}
        links={[{ label: t("smartTvDevModeLink"), href: DOC_TV_DEVICE }]}
        images={[{ ...IMG.developerMode, alt: t("smartTvDevModeImgAlt") }]}
      />

      {/* 3 ─ Create the app and iterate in a browser. */}
      <GroupLabel marginTop={8}>{t("smartTvScaffoldGroup")}</GroupLabel>

      <StepSection
        heading={t("smartTvScaffoldHeading")}
        description={t("smartTvScaffoldDesc")}
        code={TV_SCAFFOLD}
      />
      <StepSection
        heading={t("smartTvDevHeading")}
        description={t("smartTvDevDesc")}
        code={TV_DEV}
      />

      {/* 4 ─ Link the built bundle into Tizen Studio and build the .wgt there. */}
      <GroupLabel marginTop={8}>{t("smartTvPackageGroup")}</GroupLabel>

      <StepSection
        heading={t("smartTvLinkIdeHeading")}
        description={t("smartTvLinkIdeDesc")}
        links={[{ label: t("smartTvLinkIdeLink"), href: DOC_IMPORT }]}
        code={TV_LINK}
      />
      <StepSection
        heading={t("smartTvPackageHeading")}
        description={t("smartTvPackageDesc")}
        code={TV_PACKAGE}
      />

      {/* 5 ─ Run the signed package on the emulator, then the real TV. */}
      <GroupLabel marginTop={8}>{t("smartTvEmulatorGroup")}</GroupLabel>

      <StepSection
        heading={t("smartTvRunEmuHeading")}
        description={t("smartTvRunEmuDesc")}
        code={TV_EMULATOR_RUN}
      />

      <GroupLabel marginTop={8}>{t("smartTvDeviceGroup")}</GroupLabel>

      <StepSection
        heading={t("smartTvDeployHeading")}
        description={t("smartTvDeployDesc")}
        code={TV_DEVICE_RUN}
      />
    </>
  );
}

interface StepImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

interface StepLink {
  label: string;
  href: string;
}

function StepSection({
  heading,
  description,
  code,
  links,
  images,
}: {
  heading: string;
  description: string;
  code?: string;
  links?: StepLink[];
  images?: StepImage[];
}) {
  return (
    <Box flexDirection="column" gap={8} marginBottom={40}>
      <Typography as="h2" variant="h3">
        {heading}
      </Typography>
      <Typography as="p" variant="body" color="var(--foreground-muted)">
        {description}
      </Typography>
      {links && links.length > 0 && (
        <Box flexDirection="column" gap={6} marginTop={4}>
          {links.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--accent)",
                textDecoration: "underline",
                fontSize: 14,
              }}
            >
              {label}
            </a>
          ))}
        </Box>
      )}
      {code && <CodeBlock language="bash" code={code} />}
      {images?.map((img) => (
        <Screenshot key={img.src} {...img} />
      ))}
    </Box>
  );
}

function Screenshot({ src, alt, width, height }: StepImage) {
  return (
    <Box
      width="100%"
      maxWidth={Math.min(width, 720)}
      border="1px solid rgba(128, 128, 128, 0.2)"
      borderRadius={8}
      marginTop={4}
      styles={{ overflow: "hidden" }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 720px) 100vw, 720px"
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </Box>
  );
}

function GroupLabel({
  children,
  marginTop,
}: {
  children: React.ReactNode;
  marginTop?: number;
}) {
  return (
    <Typography
      as="p"
      variant="none"
      color="var(--foreground-muted)"
      fontWeight={600}
      marginTop={marginTop}
      marginBottom={24}
      styles={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </Typography>
  );
}
