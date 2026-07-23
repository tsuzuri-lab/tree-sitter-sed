# tree-sitter-sed

[![CI](https://github.com/tsuzuri-lab/tree-sitter-sed/actions/workflows/ci.yml/badge.svg)](https://github.com/tsuzuri-lab/tree-sitter-sed/actions/workflows/ci.yml)

A [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for `sed`
scripts, covering POSIX.1-2024 syntax and GNU `sed` 4.10 extensions.

This is a pre-1.0, source-only project. Generated C sources and highlighting
queries are included; language bindings and registry packages are not. Named
nodes may change between 0.x releases.

## Compatibility

The parser accepts POSIX.1-2024 syntax plus GNU commands, addresses, modifiers,
inline text, whitespace, and separator extensions. It does not provide a
runtime dialect switch.

- Regular expressions and shell commands are opaque nodes. Their internal
  syntax and other semantic constraints are not validated.
- LF and CRLF are supported. CRLF is treated as a physical line ending rather
  than matching GNU `sed`'s byte-level CR handling. Bare CR operands and CR or
  backslash delimiters are supported.
- BSD and other implementation-specific extensions are outside the supported
  syntax.

## Development

```sh
npm ci
npm run setup:cli
npm run check
```

`npm test` runs the corpus, highlighting, and Node regression tests.
`npm run check` also verifies that generated files are current. No global
Tree-sitter installation is required.

## References

- [POSIX.1-2024 `sed`](https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/utilities/sed.html)
- [GNU `sed` 4.10 manual](https://www.gnu.org/software/sed/manual/html_node/index.html)

## License

[MIT](LICENSE)
