# Ellweb3 fork notes

This is a fork of [Lum1104/Understand-Anything](https://github.com/Lum1104/Understand-Anything) that adds **Dart / Flutter** support.

## What's new vs upstream

- **Dart language config** (`packages/core/src/languages/configs/dart.ts`)
  - Detects `.dart` files
  - Lists Flutter / Dart-specific concepts (mixins, extensions, null safety, async/await, isolates, records, sealed classes, Riverpod, widgets)
- **`DartExtractor`** (`packages/core/src/plugins/extractors/dart-extractor.ts`)
  - Parses `class_definition`, `mixin_declaration`, `extension_declaration`, `enum_declaration`, top-level `function_signature`, getters/setters, and `import_or_export`
  - Visibility follows Dart's underscore convention (public unless name starts with `_`)
- **Dart import resolver** (`skills/understand/extract-import-map.mjs`)
  - `package:my_pkg/foo.dart` → anchored at the matching `pubspec.yaml`'s `name`, resolves to `<pubspec-dir>/lib/foo.dart`
  - Relative imports (`./foo.dart`, `../utils/foo.dart`)
  - `dart:` SDK imports treated as external
- **Vendored WASM grammar** (`packages/core/wasm/tree-sitter-dart.wasm`, 1.2 MB)
  - Built from [UserNobody14/tree-sitter-dart](https://github.com/UserNobody14/tree-sitter-dart) via `tree-sitter build --wasm` (auto-fetches wasi-sdk — no emscripten required)
  - Tested on a real Flutter app (329 files): 0 parse errors
- **`TreeSitterConfigSchema.localWasmPath`** — new optional field for vendoring grammars inside the monorepo without requiring an npm package

## Installation

```text
/plugin marketplace add Ellweb3/Understand-Anything
/plugin install understand-anything
```

### After install: install Node deps

`/plugin install` extracts the plugin code but does NOT run `pnpm install`. The tree-sitter grammars and `web-tree-sitter` runtime live in `node_modules`, so without this step the analysis scripts will fail with `Cannot find module 'web-tree-sitter'`.

Run once after every install / update:

```bash
cd ~/.claude/plugins/cache/understand-anything/understand-anything/<version>
pnpm install
```

The TypeScript build (`packages/core/dist/`) is committed to the repo, so you do NOT need to run `pnpm build` separately.

## Sync with upstream

```bash
cd ~/Development/tools/understand-anything-fork
git fetch upstream
git merge upstream/main
# resolve any conflicts (likely small — fork touches index.ts/scan-project.mjs + new files)
pnpm --filter @understand-anything/core build
git add understand-anything-plugin/packages/core/dist/
git commit -m "chore: rebuild dist after upstream sync"
git push origin main
```

## Roadmap

- [ ] Flutter widget detection — tag `StatelessWidget`/`StatefulWidget`/`ConsumerWidget` subclasses as `widget`
- [ ] Riverpod provider detection
- [ ] `part 'foo.dart';` directives as a dedicated `part_of` edge type
- [ ] Upstream PR

## License

Same as upstream (MIT).
