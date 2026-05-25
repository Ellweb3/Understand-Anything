import type { StructuralAnalysis, CallGraphEntry } from "../../types.js";
import type { LanguageExtractor, TreeSitterNode } from "./types.js";
/**
 * Dart extractor for tree-sitter structural analysis and call graph extraction.
 *
 * Grammar source: UserNobody14/tree-sitter-dart (tested on Dart 3.x + Flutter).
 *
 * Dart visibility convention: identifiers prefixed with `_` are library-private;
 * everything else is "exported" (visible to other libraries that import this file).
 *
 * Handled top-level node types:
 *   - class_definition         (name, body, superclass, mixins?, interfaces?)
 *   - mixin_declaration        (name, body)
 *   - extension_declaration    (name?, on, body)
 *   - enum_declaration         (name, body)
 *   - function_signature + function_body (top-level function)
 *   - getter_signature, setter_signature
 *   - import_or_export -> library_import (URI in quotes)
 *   - part_directive / part_of_directive
 */
export declare class DartExtractor implements LanguageExtractor {
    readonly languageIds: string[];
    extractStructure(rootNode: TreeSitterNode): StructuralAnalysis;
    extractCallGraph(rootNode: TreeSitterNode): CallGraphEntry[];
    private extractClass;
    private extractMixin;
    private extractExtension;
    private extractEnum;
    /**
     * Walk a class/mixin/extension/enum body and collect method/property names.
     * Tree-sitter-dart wraps most class members under `declaration` nodes that
     * contain either a method_signature/function_body pair or a field-like
     * declaration. We use a conservative pass that picks up:
     *   - method signatures (named functions inside class bodies)
     *   - constructor signatures
     *   - getter/setter signatures
     *   - initialized identifier lists (fields)
     */
    private walkClassBody;
    /**
     * Top-level function: a `function_signature` at root level. The next sibling
     * may be a `function_body` (regular) or absent (abstract — rare at top level).
     * Either way, we record the function with the signature's line range.
     */
    private extractTopLevelFunction;
    private extractTopLevelAccessor;
    /**
     * Find the canonical "name" identifier inside a *_signature node.
     * Most signatures expose `name` as a field; fall back to scanning for the
     * first identifier child.
     */
    private findSignatureName;
    private extractParamsFromSignature;
    private firstIdentifier;
    /**
     * Extract an import URI from an `import_or_export` node.
     *
     * The URI text is a quoted string literal, e.g.
     *   import 'package:flutter/material.dart';
     *   import '../utils/helpers.dart' show foo;
     *
     * We strip quotes and keep the raw URI; downstream import-resolver maps
     * package: / relative paths to project-internal files.
     */
    private extractImportOrExport;
    private findFirstStringLiteral;
    /**
     * Treat named top-level declarations (classes, mixins, extensions, enums)
     * as exports unless their name starts with `_`.
     */
    private addExportFromNamed;
}
//# sourceMappingURL=dart-extractor.d.ts.map