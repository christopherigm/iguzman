// Browser shim for Node.js built-ins referenced in vendor code.
// web-tree-sitter guards its fs/path calls with `process.versions?.node`,
// so these paths never run in the browser; the file just satisfies
// Turbopack's module-resolution step in dev mode.
export default {};
