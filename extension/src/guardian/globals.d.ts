// Ambient declaration for the esbuild-injected distribution flag.
// `scripts/build-userscript.cjs` replaces `__FSU_DISTRIBUTED__` with `true`
// in the shipped bundle; in source (Node) it is undefined.
var __FSU_DISTRIBUTED__: boolean | undefined;
