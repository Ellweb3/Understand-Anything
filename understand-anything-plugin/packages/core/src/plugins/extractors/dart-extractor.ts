import type { StructuralAnalysis, CallGraphEntry } from "../../types.js";
import type { LanguageExtractor, TreeSitterNode } from "./types.js";
import { findChild, findChildren } from "./base-extractor.js";

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
export class DartExtractor implements LanguageExtractor {
  readonly languageIds = ["dart"];

  extractStructure(rootNode: TreeSitterNode): StructuralAnalysis {
    const functions: StructuralAnalysis["functions"] = [];
    const classes: StructuralAnalysis["classes"] = [];
    const imports: StructuralAnalysis["imports"] = [];
    const exports: StructuralAnalysis["exports"] = [];

    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      if (!node) continue;

      switch (node.type) {
        case "class_definition":
          this.extractClass(node, classes);
          this.addExportFromNamed(node, exports);
          break;

        case "mixin_declaration":
          this.extractMixin(node, classes);
          this.addExportFromNamed(node, exports);
          break;

        case "extension_declaration":
          this.extractExtension(node, classes);
          this.addExportFromNamed(node, exports);
          break;

        case "enum_declaration":
          this.extractEnum(node, classes);
          this.addExportFromNamed(node, exports);
          break;

        // Top-level function: typically `function_signature` followed by `function_body`
        // at the root level. The signature carries the name.
        case "function_signature":
          this.extractTopLevelFunction(node, rootNode, i, functions, exports);
          break;

        case "getter_signature":
        case "setter_signature":
          this.extractTopLevelAccessor(node, functions, exports);
          break;

        case "import_or_export":
          this.extractImportOrExport(node, imports);
          break;
      }
    }

    return { functions, classes, imports, exports };
  }

  extractCallGraph(rootNode: TreeSitterNode): CallGraphEntry[] {
    const entries: CallGraphEntry[] = [];
    const functionStack: string[] = [];

    const walk = (node: TreeSitterNode) => {
      let pushed = false;

      // Track entering function/method scopes
      if (
        node.type === "function_signature" ||
        node.type === "method_signature" ||
        node.type === "constructor_signature"
      ) {
        const name = this.findSignatureName(node);
        if (name) {
          functionStack.push(name);
          pushed = true;
        }
      }

      // Dart call: typical pattern is `identifier(arguments)` or `obj.method(args)`.
      // Tree-sitter-dart's call-like nodes include `argument_part` attached to a primary.
      // Simpler heuristic: match `selector` chains and direct invocations.
      if (
        node.type === "selector" ||
        node.type === "primary"
      ) {
        // We look for child that is an identifier followed by an argument_part sibling.
        // Resolved via parent walking below.
      }

      // Direct invocation: child sequence `identifier` + `arguments`
      if (node.type === "arguments" && node.previousSibling) {
        const callee = node.previousSibling;
        if (
          (callee.type === "identifier" || callee.type === "qualified") &&
          functionStack.length > 0
        ) {
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee: callee.text,
            lineNumber: callee.startPosition.row + 1,
          });
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }

      if (pushed) functionStack.pop();
    };

    walk(rootNode);
    return entries;
  }

  // ---- Private helpers ----

  private extractClass(
    node: TreeSitterNode,
    classes: StructuralAnalysis["classes"],
  ): void {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const methods: string[] = [];
    const properties: string[] = [];

    const body = node.childForFieldName("body");
    if (body) {
      this.walkClassBody(body, methods, properties);
    }

    classes.push({
      name: nameNode.text,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      methods,
      properties,
    });
  }

  private extractMixin(
    node: TreeSitterNode,
    classes: StructuralAnalysis["classes"],
  ): void {
    const nameNode =
      node.childForFieldName("name") ?? findChild(node, "identifier");
    if (!nameNode) return;

    const methods: string[] = [];
    const properties: string[] = [];

    // mixin body — try field then fallback to class_body / declaration_block child
    const body =
      node.childForFieldName("body") ??
      findChild(node, "class_body") ??
      findChild(node, "declaration_block");
    if (body) {
      this.walkClassBody(body, methods, properties);
    }

    classes.push({
      name: nameNode.text,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      methods,
      properties,
    });
  }

  private extractExtension(
    node: TreeSitterNode,
    classes: StructuralAnalysis["classes"],
  ): void {
    // Extensions may be named (`extension MyExt on Foo {}`) or unnamed.
    const nameNode =
      node.childForFieldName("name") ?? findChild(node, "identifier");
    const onNode =
      node.childForFieldName("on") ??
      // tree-sitter-dart sometimes exposes the target as a type_identifier child
      findChild(node, "type_identifier");

    const baseName = nameNode ? nameNode.text : "<unnamed-extension>";
    const onLabel = onNode ? ` on ${onNode.text}` : "";
    const displayName = baseName + onLabel;

    const methods: string[] = [];
    const properties: string[] = [];

    const body =
      node.childForFieldName("body") ??
      findChild(node, "class_body") ??
      findChild(node, "extension_body") ??
      findChild(node, "declaration_block");
    if (body) {
      this.walkClassBody(body, methods, properties);
    }

    classes.push({
      name: displayName,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      methods,
      properties,
    });
  }

  private extractEnum(
    node: TreeSitterNode,
    classes: StructuralAnalysis["classes"],
  ): void {
    const nameNode =
      node.childForFieldName("name") ?? findChild(node, "identifier");
    if (!nameNode) return;

    const methods: string[] = [];
    const properties: string[] = [];

    const body =
      node.childForFieldName("body") ??
      findChild(node, "enum_body") ??
      findChild(node, "class_body");
    if (body) {
      this.walkClassBody(body, methods, properties);
    }

    // Enum is class-like for the purposes of the graph; we already include
    // its name and any methods/computed properties.
    classes.push({
      name: nameNode.text,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      methods,
      properties,
    });
  }

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
  private walkClassBody(
    body: TreeSitterNode,
    methods: string[],
    properties: string[],
  ): void {
    const visit = (node: TreeSitterNode) => {
      switch (node.type) {
        case "method_signature":
        case "function_signature":
        case "operator_signature": {
          const name = this.findSignatureName(node);
          if (name) methods.push(name);
          return; // don't recurse into signature internals
        }
        case "constructor_signature":
        case "factory_constructor_signature":
        case "constant_constructor_signature":
        case "redirecting_factory_constructor_signature": {
          const name = this.findSignatureName(node);
          if (name) methods.push(name);
          return;
        }
        case "getter_signature":
        case "setter_signature": {
          const name = this.findSignatureName(node);
          if (name) methods.push(name);
          return;
        }
        case "initialized_identifier_list":
        case "static_final_declaration_list":
        case "final_declaration_list":
        case "variable_declaration": {
          // Collect every identifier directly under this list as a property.
          for (const id of findChildren(node, "identifier")) {
            properties.push(id.text);
          }
          for (const ii of findChildren(node, "initialized_identifier")) {
            const id = findChild(ii, "identifier");
            if (id) properties.push(id.text);
          }
          return;
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visit(child);
      }
    };

    visit(body);
  }

  /**
   * Top-level function: a `function_signature` at root level. The next sibling
   * may be a `function_body` (regular) or absent (abstract — rare at top level).
   * Either way, we record the function with the signature's line range.
   */
  private extractTopLevelFunction(
    sigNode: TreeSitterNode,
    rootNode: TreeSitterNode,
    sigIndex: number,
    functions: StructuralAnalysis["functions"],
    exports: StructuralAnalysis["exports"],
  ): void {
    const name = this.findSignatureName(sigNode);
    if (!name) return;

    // Try to extend lineRange through the function body that follows.
    let endRow = sigNode.endPosition.row;
    const next = rootNode.child(sigIndex + 1);
    if (next && next.type === "function_body") {
      endRow = next.endPosition.row;
    }

    const params = this.extractParamsFromSignature(sigNode);

    functions.push({
      name,
      lineRange: [sigNode.startPosition.row + 1, endRow + 1],
      params,
    });

    // Public top-level identifier → export
    if (!name.startsWith("_")) {
      exports.push({
        name,
        lineNumber: sigNode.startPosition.row + 1,
      });
    }
  }

  private extractTopLevelAccessor(
    node: TreeSitterNode,
    functions: StructuralAnalysis["functions"],
    exports: StructuralAnalysis["exports"],
  ): void {
    const name = this.findSignatureName(node);
    if (!name) return;

    functions.push({
      name,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      params: [],
    });

    if (!name.startsWith("_")) {
      exports.push({ name, lineNumber: node.startPosition.row + 1 });
    }
  }

  /**
   * Find the canonical "name" identifier inside a *_signature node.
   * Most signatures expose `name` as a field; fall back to scanning for the
   * first identifier child.
   */
  private findSignatureName(sigNode: TreeSitterNode): string | null {
    const nameField = sigNode.childForFieldName("name");
    if (nameField) return nameField.text;

    // Scan children for an identifier (skip leading keywords/modifiers).
    for (let i = 0; i < sigNode.childCount; i++) {
      const c = sigNode.child(i);
      if (!c) continue;
      if (c.type === "identifier") return c.text;
      // Some signatures wrap the name in a `qualified` or `function_name` node.
      if (c.type === "function_name") {
        const inner = findChild(c, "identifier");
        if (inner) return inner.text;
      }
    }
    return null;
  }

  private extractParamsFromSignature(sigNode: TreeSitterNode): string[] {
    const params: string[] = [];
    const formalParams =
      sigNode.childForFieldName("parameters") ??
      findChild(sigNode, "formal_parameter_list") ??
      findChild(sigNode, "formal_parameter_part");
    if (!formalParams) return params;

    const collect = (node: TreeSitterNode) => {
      if (node.type === "formal_parameter" || node.type === "normal_formal_parameter" || node.type === "named_formal_parameter") {
        // identifier somewhere inside
        const id = findChild(node, "identifier") ?? this.firstIdentifier(node);
        if (id) params.push(id.text);
        return;
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) collect(c);
      }
    };
    collect(formalParams);
    return params;
  }

  private firstIdentifier(node: TreeSitterNode): TreeSitterNode | null {
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (!c) continue;
      if (c.type === "identifier") return c;
      const nested = this.firstIdentifier(c);
      if (nested) return nested;
    }
    return null;
  }

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
  private extractImportOrExport(
    node: TreeSitterNode,
    imports: StructuralAnalysis["imports"],
  ): void {
    // The child is typically `library_import` or `library_export`; both contain
    // an `import_specification` or similar with a configurable_uri/uri leaf.
    const uri = this.findFirstStringLiteral(node);
    if (!uri) return;

    imports.push({
      source: uri,
      specifiers: [],
      lineNumber: node.startPosition.row + 1,
    });
  }

  private findFirstStringLiteral(node: TreeSitterNode): string | null {
    // String literal node types in tree-sitter-dart: `string_literal`,
    // `uri`, `configurable_uri`. Recurse until we find a quoted text node.
    const candidates = ["string_literal", "uri", "configurable_uri"];
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (!c) continue;
      if (candidates.includes(c.type)) {
        // Strip surrounding single/double quotes from text.
        return c.text.replace(/^['"]|['"]$/g, "").replace(/^['"]|['"]$/g, "");
      }
      const inner = this.findFirstStringLiteral(c);
      if (inner) return inner;
    }
    return null;
  }

  /**
   * Treat named top-level declarations (classes, mixins, extensions, enums)
   * as exports unless their name starts with `_`.
   */
  private addExportFromNamed(
    node: TreeSitterNode,
    exports: StructuralAnalysis["exports"],
  ): void {
    const nameNode =
      node.childForFieldName("name") ?? findChild(node, "identifier");
    if (!nameNode) return;
    if (nameNode.text.startsWith("_")) return;
    exports.push({
      name: nameNode.text,
      lineNumber: node.startPosition.row + 1,
    });
  }
}
