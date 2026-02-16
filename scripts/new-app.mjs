import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { APPS_DIR, createPrompt } from './utils.mjs';

// ── Update prompt ──────────────────────────────────────────────────────
// Update new-app.mjs file to reflect changes made in apps/web and its dependencies

// ── Constants ──────────────────────────────────────────────────────────

const VALID_PALETTES = [
  'cyan',
  'ocean',
  'rose',
  'emerald',
  'amber',
  'violet',
  'slate',
  'coral',
  'teal',
  'fuchsia',
];

// ── Helpers ────────────────────────────────────────────────────────────

function validateAppName(name) {
  if (!name) return 'App name is required.';
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    return 'Name must start with a letter and contain only lowercase letters, numbers, and hyphens.';
  if (existsSync(join(APPS_DIR, name)))
    return `Directory apps/${name} already exists.`;
  return null;
}

function writeFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function toTitleCase(str) {
  return str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Template Functions ─────────────────────────────────────────────────

function packageJson(name, port, includeI18n) {
  const pkg = {
    name,
    version: '0.1.0',
    type: 'module',
    private: true,
    scripts: {
      dev: `next dev --port ${port}`,
      build: 'next build',
      start: 'next start',
      lint: 'eslint --max-warnings 0',
      'check-types': includeI18n
        ? 'next typegen && tsc --noEmit'
        : 'tsc --noEmit',
    },
    dependencies: {
      '@repo/helpers': 'workspace:*',
      '@repo/ui': 'workspace:*',
      react: '^19.2.4',
      'react-dom': '^19.2.4',
    },
    devDependencies: {
      '@repo/eslint-config': 'workspace:*',
      '@repo/typescript-config': 'workspace:*',
      '@types/node': '^25.2.3',
      '@types/react': '19.2.14',
      '@types/react-dom': '19.2.3',
      eslint: '^9.39.2',
      typescript: '5.9.3',
    },
  };

  if (includeI18n) {
    pkg.dependencies['@repo/i18n'] = 'workspace:^';
    pkg.dependencies['next-intl'] = '^4';
  }

  return JSON.stringify(pkg, null, 2) + '\n';
}

function nextConfig(includeI18n) {
  if (includeI18n) {
    return `import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
`;
  }

  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
`;
}

function tsConfig() {
  return (
    JSON.stringify(
      {
        extends: '@repo/typescript-config/nextjs.json',
        compilerOptions: {
          plugins: [{ name: 'next' }],
          allowArbitraryExtensions: true,
        },
        include: [
          '**/*.ts',
          '**/*.tsx',
          'next-env.d.ts',
          'next.config.js',
          '.next/types/**/*.ts',
        ],
        exclude: ['node_modules'],
      },
      null,
      2,
    ) + '\n'
  );
}

function eslintConfig() {
  return `import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default nextJsConfig;
`;
}

function gitignore() {
  return `# dependencies
/node_modules
/.pnp
.pnp.js
.yarn/install-state.gz

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# env files (can opt-in for commiting if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
`;
}

function globalsCss() {
  return `@import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap');

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
  font-family: 'Roboto', sans-serif;
  font-optical-sizing: auto;
  font-style: normal;
}

body {
  color: var(--foreground);
  background: var(--background);
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}
`;
}

function layoutTsx(palette, includeI18n) {
  if (includeI18n) {
    return `import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { ThemeProvider, ThemeScript } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { routing } from '@repo/i18n/routing';
import { Navbar } from '@repo/ui/core-elements/navbar';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: 'Metadata' })) as (
    key: string,
  ) => string;

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get('theme-mode')?.value as
    | ThemeMode
    | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? 'system';
  const initialResolved: ResolvedTheme =
    initialMode === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang={locale}
      data-theme={initialResolved}
      style={{ colorScheme: initialResolved }}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <NextIntlClientProvider messages={messages}>
        <ThemeProvider
          initialMode={initialMode}
          initialResolved={initialResolved}
        >
          <PaletteProvider palette="${palette}">
            <Navbar
              logo="/logo.png"
              items={[{ label: 'Home', href: '/' }]}
              version="v0.1.0"
            />
            {children}
          </PaletteProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </html>
  );
}
`;
  }

  return `import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ThemeProvider, ThemeScript } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { Navbar } from '@repo/ui/core-elements/navbar';
import './globals.css';

type Props = {
  children: React.ReactNode;
};

export const metadata: Metadata = {
  title: '${palette}',
  description: '',
};

export default async function RootLayout({ children }: Props) {
  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get('theme-mode')?.value as
    | ThemeMode
    | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? 'system';
  const initialResolved: ResolvedTheme =
    initialMode === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang="en"
      data-theme={initialResolved}
      style={{ colorScheme: initialResolved }}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <ThemeProvider
        initialMode={initialMode}
        initialResolved={initialResolved}
      >
        <PaletteProvider palette="${palette}">
          <Navbar
            logo="/logo.png"
            items={[{ label: 'Home', href: '/' }]}
            version="v0.1.0"
          />
          {children}
        </PaletteProvider>
      </ThemeProvider>
    </html>
  );
}
`;
}

function pageTsx(name, includeI18n) {
  const title = toTitleCase(name);

  if (includeI18n) {
    return `import { setRequestLocale } from 'next-intl/server';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Container
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ minHeight: '100vh' }}
    >
      <Box
        width={360}
        padding={32}
        borderRadius={12}
        flexDirection="column"
        alignItems="center"
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 16,
          }}
        >
          ${title}
        </h1>
        <ThemeSwitch />
      </Box>
    </Container>
  );
}
`;
  }

  return `import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';

export default function Home() {
  return (
    <Container
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ minHeight: '100vh' }}
    >
      <Box
        width={360}
        padding={32}
        borderRadius={12}
        flexDirection="column"
        alignItems="center"
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 16,
          }}
        >
          ${title}
        </h1>
        <ThemeSwitch />
      </Box>
    </Container>
  );
}
`;
}

function proxyTs() {
  return `import createMiddleware from 'next-intl/middleware';
import { routing } from '@repo/i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\\\..*).*)',
};
`;
}

function i18nRequestTs() {
  return `import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@repo/i18n/routing';
import { getSharedMessages } from '@repo/i18n/request';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const [sharedMessages, localMessages] = await Promise.all([
    getSharedMessages(locale),
    import(\`../messages/\${locale}.json\`).then((m) => m.default),
  ]);

  return {
    locale,
    messages: { ...sharedMessages, ...localMessages },
  };
});
`;
}

function globalDts() {
  return `import type sharedMessages from '@repo/i18n/messages/en';
import type localMessages from './messages/en.json';

type Messages = typeof sharedMessages & typeof localMessages;

declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}
`;
}

function messagesJson(lang, name) {
  const title = toTitleCase(name);

  if (lang === 'en') {
    return (
      JSON.stringify(
        {
          Metadata: { title, description: '' },
          HomePage: { title },
        },
        null,
        2,
      ) + '\n'
    );
  }

  return (
    JSON.stringify(
      {
        Metadata: { title, description: '' },
        HomePage: { title },
      },
      null,
      2,
    ) + '\n'
  );
}

// ── Deployment Template Functions ─────────────────────────────────────

function dockerfile(name) {
  return `# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

# ---------------------------------------------------------------------------
# Stage 1 – Prune the monorepo so only packages needed by "${name}" are kept.
# This avoids installing unnecessary workspace dependencies.
# ---------------------------------------------------------------------------
FROM base AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune ${name} --docker

# ---------------------------------------------------------------------------
# Stage 2 – Install production + build dependencies (cached layer).
# Only the pruned package.json files and lockfile are copied so that
# source-code changes do not invalidate this layer.
# ---------------------------------------------------------------------------
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=pruner /app/out/json/ ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 3 – Build the Next.js application.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./

ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm && pnpm exec turbo run build --filter=${name} --no-daemon

# ---------------------------------------------------------------------------
# Stage 4 – Minimal production image.
# Uses the standalone output so node_modules are NOT copied.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime system dependencies
RUN apk add --no-cache \\
    ffmpeg \\
    curl \\
    jq \\
    wget \\
    python3

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 nextjs

# Copy only what the standalone server needs
COPY --from=builder /app/apps/${name}/public ./apps/${name}/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/${name}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${name}/.next/static ./apps/${name}/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is generated by \`next build\` when output is "standalone"
CMD ["node", "apps/${name}/server.js"]
`;
}

function envExample(name) {
  return `DOCKER_REGISTRY=docker
NAMESPACE=${name}
`;
}

function helmChartYaml(name) {
  return `apiVersion: v2
name: ${name}
description: Helm chart for the Next.js ${name} application
type: application
version: 0.1.0
appVersion: '0.1.0'
`;
}

function helmValuesYaml(name, registryUser) {
  return `# ─────────────────────────────────────────────────────────────
# ${toTitleCase(name)} Application – Helm Values
# ─────────────────────────────────────────────────────────────

# -- Number of old ReplicaSets to keep for rollbacks (default: 2)
revisionHistoryLimit: 2 # how many old ReplicaSets to keep for rollbacks

# -- Number of pod replicas
replicaCount: 2

# ─── Container image ────────────────────────────────────────
image:
  repository: ${registryUser}/${name} # registry/image (no tag)
  tag: 'latest' # overrides Chart.appVersion
  pullPolicy: IfNotPresent

imagePullSecrets: []
# - name: my-registry-secret

# ─── Name overrides ─────────────────────────────────────────
nameOverride: ''
fullnameOverride: ''

# ─── Service ────────────────────────────────────────────────
service:
  type: ClusterIP
  port: 80 # port exposed by the Service
  targetPort: 3000 # port the container listens on

# ─── Ingress ────────────────────────────────────────────────
ingress:
  enabled: true
  className: 'nginx' # MicroK8s uses the nginx ingress class
  annotations:
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
  hosts:
    - host: ${name}.iguzman.com.mx
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ${name}-tls
      hosts:
        - ${name}.iguzman.com.mx

# ─── Environment variables ──────────────────────────────────
# Plain environment variables injected into the container.
env:
  NODE_ENV: 'production'
  NEXT_TELEMETRY_DISABLED: '1'
  # Add your own env vars here, for example:
  # API_URL: "https://api.example.com"

# Sensitive values – reference existing Kubernetes Secrets.
# envFromSecret:
#   - name: DATABASE_URL
#     secretName: ${name}-secrets
#     secretKey: database-url

# ─── Shared storage (ReadWriteMany) ─────────────────────────
sharedStorage:
  enabled: true
  storageClass: '' # leave empty for the cluster default
  accessModes:
    - ReadWriteMany
  size: 1Gi
  mountPath: /app/shared # path inside each container

# ─── Health probes (file-based in shared storage) ───────────
probes:
  # File that both probes check for existence.
  healthFile: /app/shared/.healthy

  startupProbe:
    exec:
      command: ['test', '-f', '/app/shared/.healthy']
    initialDelaySeconds: 5
    periodSeconds: 5
    failureThreshold: 30 # allow up to ~150 s for first boot

  livenessProbe:
    exec:
      command: ['test', '-f', '/app/shared/.healthy']
    initialDelaySeconds: 0
    periodSeconds: 10
    failureThreshold: 3

# ─── Node affinity (schedule on specific nodes) ─────────────
nodeAffinity:
  enabled: false
  # List of node names where the pods should be scheduled.
  nodeNames: []
  # - node-1
  # - node-2
  # - node-3

# ─── Resources ──────────────────────────────────────────────
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
`;
}

function helmHelpersTpl(name) {
  return `{{/*
Expand the name of the chart.
*/}}
{{- define "${name}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
Truncated at 63 chars because some Kubernetes name fields are limited to that.
*/}}
{{- define "${name}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version for the chart label.
*/}}
{{- define "${name}.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "${name}.labels" -}}
helm.sh/chart: {{ include "${name}.chart" . }}
{{ include "${name}.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "${name}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${name}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PVC name for shared storage.
*/}}
{{- define "${name}.pvcName" -}}
{{- printf "%s-shared" (include "${name}.fullname" .) }}
{{- end }}
`;
}

function helmDeploymentYaml(name) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  revisionHistoryLimit: {{ .Values.revisionHistoryLimit }}
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "${name}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${name}.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}

      {{- if .Values.nodeAffinity.enabled }}
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values:
                      {{- toYaml .Values.nodeAffinity.nodeNames | nindent 22 }}
      {{- end }}

      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}

          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP

          {{- /* ── Plain environment variables ── */}}
          {{- if or .Values.env .Values.envFromSecret }}
          env:
            {{- range $key, $value := .Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- range .Values.envFromSecret }}
            - name: {{ .name }}
              valueFrom:
                secretKeyRef:
                  name: {{ .secretName }}
                  key: {{ .secretKey }}
            {{- end }}
          {{- end }}

          {{- /* ── Probes ── */}}
          startupProbe:
            exec:
              command:
                {{- toYaml .Values.probes.startupProbe.exec.command | nindent 16 }}
            initialDelaySeconds: {{ .Values.probes.startupProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.startupProbe.periodSeconds }}
            failureThreshold: {{ .Values.probes.startupProbe.failureThreshold }}

          livenessProbe:
            exec:
              command:
                {{- toYaml .Values.probes.livenessProbe.exec.command | nindent 16 }}
            initialDelaySeconds: {{ .Values.probes.livenessProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.livenessProbe.periodSeconds }}
            failureThreshold: {{ .Values.probes.livenessProbe.failureThreshold }}

          {{- /* ── Resources ── */}}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}

          {{- /* ── Volume mounts ── */}}
          {{- if .Values.sharedStorage.enabled }}
          volumeMounts:
            - name: shared-data
              mountPath: {{ .Values.sharedStorage.mountPath }}
          {{- end }}

      {{- if .Values.sharedStorage.enabled }}
      volumes:
        - name: shared-data
          persistentVolumeClaim:
            claimName: {{ include "${name}.pvcName" . }}
      {{- end }}
`;
}

function helmServiceYaml(name) {
  return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort }}
      protocol: TCP
      name: http
  selector:
    {{- include "${name}.selectorLabels" . | nindent 4 }}
`;
}

function helmIngressYaml(name) {
  return `{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - secretName: {{ .secretName | default (printf "%s-tls" (index .hosts 0 | default "${name}")) }}
      hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- $paths := .paths | default (list (dict "path" "/" "pathType" "Prefix")) }}
          {{- range $paths }}
          - path: {{ .path }}
            pathType: {{ .pathType | default "Prefix" }}
            backend:
              service:
                name: {{ include "${name}.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
`;
}

function helmPvcYaml(name) {
  return `{{- if .Values.sharedStorage.enabled }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "${name}.pvcName" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  accessModes:
    {{- toYaml .Values.sharedStorage.accessModes | nindent 4 }}
  {{- if .Values.sharedStorage.storageClass }}
  storageClassName: {{ .Values.sharedStorage.storageClass | quote }}
  {{- end }}
  resources:
    requests:
      storage: {{ .Values.sharedStorage.size }}
{{- end }}
`;
}

function helmNotesTxt(name) {
  return `──────────────────────────────────────────────────────────────
  {{ include "${name}.fullname" . }} has been deployed!
──────────────────────────────────────────────────────────────

{{- if .Values.ingress.enabled }}
The application is accessible at:
{{- range .Values.ingress.hosts }}
  https://{{ .host }}
{{- end }}
{{- else }}

To access the application, run:

  kubectl port-forward svc/{{ include "${name}.fullname" . }} {{ .Values.service.port }}:{{ .Values.service.targetPort }}

Then open http://localhost:{{ .Values.service.port }} in your browser.
{{- end }}

Replicas: {{ .Values.replicaCount }}
{{- if .Values.sharedStorage.enabled }}
Shared volume: {{ .Values.sharedStorage.mountPath }} ({{ .Values.sharedStorage.size }})
{{- end }}
`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  New App Scaffold\n');

  const { rl, prompt } = createPrompt();

  // App name
  let name = '';
  while (true) {
    name = await prompt('  App name');
    const error = validateAppName(name);
    if (!error) break;
    console.log(`  Error: ${error}`);
  }

  // Port
  let port = 3001;
  while (true) {
    const portInput = await prompt('  Port', '3001');
    const parsed = parseInt(portInput, 10);
    if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
      port = parsed;
      break;
    }
    console.log('  Error: Port must be a number between 1024 and 65535.');
  }

  // i18n
  const i18nInput = await prompt('  Include i18n (next-intl)? [y/n]', 'y');
  const includeI18n = i18nInput.toLowerCase().startsWith('y');

  // Palette
  let palette = 'cyan';
  while (true) {
    const paletteInput = await prompt(
      `  Palette [${VALID_PALETTES.join(', ')}]`,
      'cyan',
    );
    if (VALID_PALETTES.includes(paletteInput)) {
      palette = paletteInput;
      break;
    }
    console.log(`  Error: Must be one of: ${VALID_PALETTES.join(', ')}`);
  }

  // Docker registry user
  const registryUser = await prompt('  Docker registry user', 'docker');

  rl.close();

  // Build
  const appDir = join(APPS_DIR, name);
  const appPath = (rel) => join(appDir, rel);

  console.log(`\n  Creating apps/${name}...\n`);

  // Static files (always created)
  writeFile(appPath('package.json'), packageJson(name, port, includeI18n));
  writeFile(appPath('next.config.js'), nextConfig(includeI18n));
  writeFile(appPath('tsconfig.json'), tsConfig());
  writeFile(appPath('eslint.config.js'), eslintConfig());
  writeFile(appPath('.gitignore'), gitignore());
  writeFile(appPath('app/globals.css'), globalsCss());

  // Create empty public directory
  mkdirSync(appPath('public'), { recursive: true });

  if (includeI18n) {
    // i18n variant: files go under app/[locale]/
    writeFile(appPath('app/[locale]/layout.tsx'), layoutTsx(palette, true));
    writeFile(appPath('app/[locale]/page.tsx'), pageTsx(name, true));
    writeFile(appPath('proxy.ts'), proxyTs());
    writeFile(appPath('i18n/request.ts'), i18nRequestTs());
    writeFile(appPath('global.d.ts'), globalDts());
    writeFile(appPath('messages/en.json'), messagesJson('en', name));
    writeFile(appPath('messages/es.json'), messagesJson('es', name));
  } else {
    // No i18n: files go directly under app/
    writeFile(appPath('app/layout.tsx'), layoutTsx(palette, false));
    writeFile(appPath('app/page.tsx'), pageTsx(name, false));
  }

  // Deployment files
  writeFile(appPath('Dockerfile'), dockerfile(name));
  writeFile(appPath('env.example'), envExample(name));

  // Helm chart
  writeFile(appPath('helm/Chart.yaml'), helmChartYaml(name));
  writeFile(appPath('helm/values.yaml'), helmValuesYaml(name, registryUser));
  writeFile(appPath('helm/templates/_helpers.tpl'), helmHelpersTpl(name));
  writeFile(
    appPath('helm/templates/deployment.yaml'),
    helmDeploymentYaml(name),
  );
  writeFile(appPath('helm/templates/service.yaml'), helmServiceYaml(name));
  writeFile(appPath('helm/templates/ingress.yaml'), helmIngressYaml(name));
  writeFile(appPath('helm/templates/pvc.yaml'), helmPvcYaml(name));
  writeFile(appPath('helm/templates/NOTES.txt'), helmNotesTxt(name));

  console.log(`  Done! Created apps/${name} with the following setup:`);
  console.log(`    Port:     ${port}`);
  console.log(`    i18n:     ${includeI18n ? 'yes' : 'no'}`);
  console.log(`    Palette:  ${palette}`);
  console.log(`    Registry: ${registryUser}/${name}`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. pnpm install');
  console.log(`    2. pnpm --filter ${name} dev`);
  console.log(`    3. cp apps/${name}/env.example apps/${name}/.env`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
