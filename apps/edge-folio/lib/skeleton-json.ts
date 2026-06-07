export interface SkeletonInfra {
  hasDocker: boolean;
  hasKubernetes: boolean;
  ciSystems: string[];
  cloudHints: string[];
}

export interface SkeletonJson {
  scannedAt: string;
  projectName: string;
  languages: string[];
  frameworks: string[];
  runtimeDeps: string[];
  devDeps: string[];
  importedModules: string[];
  infra: SkeletonInfra;
  kicadFiles: string[];
  fileStats: {
    totalFiles: number;
    codeFiles: number;
  };
}
