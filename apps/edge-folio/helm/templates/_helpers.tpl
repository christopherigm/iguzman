{{/*
Expand the name of the chart.
*/}}
{{- define "edge-folio.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
Truncated at 63 chars because some Kubernetes name fields are limited to that.
*/}}
{{- define "edge-folio.fullname" -}}
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
{{- define "edge-folio.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "edge-folio.labels" -}}
helm.sh/chart: {{ include "edge-folio.chart" . }}
{{ include "edge-folio.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "edge-folio.selectorLabels" -}}
app.kubernetes.io/name: {{ include "edge-folio.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PVC name for shared storage.
*/}}
{{- define "edge-folio.pvcName" -}}
{{- printf "%s-shared" (include "edge-folio.fullname" .) }}
{{- end }}
