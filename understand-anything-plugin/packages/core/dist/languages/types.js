import { z } from "zod";
// Tree-sitter grammar configuration for a language.
// Provide EITHER `localWasmPath` (path relative to packages/core/) for grammars
// vendored inside this monorepo, OR `wasmPackage` + `wasmFile` to resolve from
// an installed npm package. Language-specific extractors are registered separately
// via the LanguageExtractor interface (see plugins/extractors/).
export const TreeSitterConfigSchema = z.object({
    wasmPackage: z.string().optional(),
    wasmFile: z.string().optional(),
    localWasmPath: z.string().optional(),
}).refine((c) => Boolean(c.localWasmPath) || (Boolean(c.wasmPackage) && Boolean(c.wasmFile)), { message: "TreeSitterConfig requires either localWasmPath OR both wasmPackage and wasmFile" });
// File pattern conventions for a language
export const FilePatternConfigSchema = z.object({
    entryPoints: z.array(z.string()),
    barrels: z.array(z.string()),
    tests: z.array(z.string()),
    config: z.array(z.string()),
});
// Complete language configuration (base schema — used by LanguageRegistry.register())
export const LanguageConfigSchema = z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    extensions: z.array(z.string()),
    filenames: z.array(z.string()).optional(),
    treeSitter: TreeSitterConfigSchema.optional(),
    concepts: z.array(z.string()),
    filePatterns: FilePatternConfigSchema,
});
/**
 * Strict schema with refinement: ensures at least one extension or filename
 * is provided so the config can actually be detected by the registry.
 * Use this for validating new/user-supplied configs (some builtin configs like
 * kubernetes/github-actions intentionally lack both and rely on future
 * content-based detection).
 */
export const StrictLanguageConfigSchema = LanguageConfigSchema.refine((c) => c.extensions.length > 0 || (c.filenames !== undefined && c.filenames.length > 0), { message: "LanguageConfig must have at least one extension or filename for detection" });
// Framework configuration
export const FrameworkConfigSchema = z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    languages: z.array(z.string().min(1)).min(1),
    detectionKeywords: z.array(z.string()).min(1),
    manifestFiles: z.array(z.string()).min(1),
    promptSnippetPath: z.string().min(1),
    entryPoints: z.array(z.string()).optional(),
    layerHints: z.record(z.string(), z.string()).optional(),
});
//# sourceMappingURL=types.js.map