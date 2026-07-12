// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo SDK 56+ auto-configures monorepo resolution inside getDefaultConfig:
// watchFolders, resolver.nodeModulesPaths, and hierarchical lookup across
// pnpm's isolated (symlinked) node_modules. Per Expo's monorepo guide we must
// NOT hand-set watchFolders / nodeModulesPaths / disableHierarchicalLookup -
// overriding them re-breaks resolution of nested pnpm transitive deps (e.g.
// @expo/metro-runtime -> @expo/log-box). https://docs.expo.dev/guides/monorepos/

// Honor the "exports" field so @repo/ui-native/* resolves straight from src.
config.resolver.unstable_enablePackageExports = true;

// Expo's auto watchFolders include every workspace package dir. The Django API
// apps (website-api, edge-folio-api) keep Python virtualenvs there with tens of
// thousands of files; on Linux each watched dir consumes an inotify watch and
// blows past the per-user limit, throwing ENOSPC ("System limit for number of
// file watchers reached"). None of these hold anything Metro needs to bundle,
// so exclude them. blockList feeds Metro's file-map ignorePattern, skipping
// them at both crawl and watch time. Keep every entry flagless so Metro can
// combine the array into one RegExp (mismatched flags throw at startup).
config.resolver.blockList = [
  ...config.resolver.blockList,
  /(^|\/)(venv|\.venv|__pycache__|\.mypy_cache|\.pytest_cache|\.ruff_cache|site-packages)(\/|$)/,
  /(^|\/)\.git(\/|$)/,
];

module.exports = config;
