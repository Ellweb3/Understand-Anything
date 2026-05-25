export const dartConfig = {
    id: "dart",
    displayName: "Dart",
    extensions: [".dart"],
    treeSitter: {
        localWasmPath: "wasm/tree-sitter-dart.wasm",
    },
    concepts: [
        "null safety",
        "mixins",
        "extensions",
        "async/await",
        "futures and streams",
        "isolates",
        "records and patterns",
        "sealed classes",
        "factory constructors",
        "named parameters",
        "part files",
        "package imports",
        "Flutter widgets (Stateless/Stateful/Consumer)",
        "Riverpod providers",
    ],
    filePatterns: {
        entryPoints: ["main.dart", "lib/main.dart"],
        barrels: [],
        tests: ["test/**/*_test.dart", "*_test.dart"],
        config: ["pubspec.yaml", "analysis_options.yaml"],
    },
};
//# sourceMappingURL=dart.js.map