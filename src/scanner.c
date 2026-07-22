#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

enum TokenType {
  REGEX_ADDRESS_START,
  ESCAPED_REGEX_ADDRESS_START,
  REGEX_ADDRESS_END,
  SUBSTITUTE_START,
  SUBSTITUTE_MIDDLE,
  SUBSTITUTE_END,
  TRANSLATE_START,
  TRANSLATE_MIDDLE,
  TRANSLATE_END,
  REGEX_CONTENT,
  REPLACEMENT_TEXT,
  TRANSLATE_TEXT,
  TEXT_COMMAND_START,
  TEXT_BLOCK,
  SHELL_COMMAND,
  FIRST_LINE_SILENT,
  COMMENT_COMMAND,
  FILE_ARGUMENT,
  LINE_WORD,
  GNU_OUTER_LOOP_WHITESPACE,
  RIGHT_BRACE,
};

enum ScannerMode {
  MODE_NONE,
  MODE_REGEX_ADDRESS,
  MODE_SUBSTITUTE_PATTERN,
  MODE_SUBSTITUTE_REPLACEMENT,
  MODE_TRANSLATE_SOURCE,
  MODE_TRANSLATE_DESTINATION,
  MODE_TEXT,
  MODE_TEXT_LEADIN,
};

typedef struct {
  int32_t delimiter;
  enum ScannerMode mode;
} ScannerState;

static void reset_state(ScannerState *state) {
  state->delimiter = 0;
  state->mode = MODE_NONE;
}

void *tree_sitter_sed_external_scanner_create(void) {
  ScannerState *state = calloc(1, sizeof(ScannerState));
  return state;
}

void tree_sitter_sed_external_scanner_destroy(void *payload) {
  free(payload);
}

unsigned tree_sitter_sed_external_scanner_serialize(void *payload, char *buffer) {
  ScannerState *state = payload;
  uint32_t delimiter = (uint32_t)state->delimiter;

  buffer[0] = (char)state->mode;
  buffer[1] = (char)(delimiter & 0xff);
  buffer[2] = (char)((delimiter >> 8) & 0xff);
  buffer[3] = (char)((delimiter >> 16) & 0xff);
  buffer[4] = (char)((delimiter >> 24) & 0xff);
  return 5;
}

void tree_sitter_sed_external_scanner_deserialize(
    void *payload,
    const char *buffer,
    unsigned length) {
  ScannerState *state = payload;
  reset_state(state);

  if (length != 5) {
    return;
  }

  enum ScannerMode mode = (enum ScannerMode)(unsigned char)buffer[0];
  uint32_t delimiter = (uint32_t)(unsigned char)buffer[1] |
                       ((uint32_t)(unsigned char)buffer[2] << 8) |
                       ((uint32_t)(unsigned char)buffer[3] << 16) |
                       ((uint32_t)(unsigned char)buffer[4] << 24);

  if (mode < MODE_NONE || mode > MODE_TEXT_LEADIN) {
    return;
  }

  if (mode == MODE_NONE) {
    return;
  }

  if (mode == MODE_TEXT || mode == MODE_TEXT_LEADIN) {
    if (delimiter == 0) {
      state->mode = mode;
    }
    return;
  }

  if (delimiter == 0 || delimiter > INT32_MAX || delimiter == '\n') {
    return;
  }

  state->mode = mode;
  state->delimiter = (int32_t)delimiter;
}

static void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}

static bool invalid_delimiter(TSLexer *lexer) {
  return lexer->eof(lexer) || lexer->lookahead == '\n';
}

static bool scan_simple_delimiter(
    TSLexer *lexer,
    ScannerState *state,
    enum ScannerMode next_mode) {
  if (invalid_delimiter(lexer)) {
    return false;
  }

  state->delimiter = lexer->lookahead;
  state->mode = next_mode;
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
}

static bool scan_regex_address_start(TSLexer *lexer, ScannerState *state) {
  if (lexer->lookahead != '/') {
    return false;
  }

  state->delimiter = '/';
  state->mode = MODE_REGEX_ADDRESS;
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
}

static bool scan_escaped_regex_address_start(
    TSLexer *lexer,
    ScannerState *state) {
  if (lexer->lookahead != '\\') {
    return false;
  }

  advance(lexer);
  if (invalid_delimiter(lexer)) {
    return false;
  }

  state->delimiter = lexer->lookahead;
  state->mode = MODE_REGEX_ADDRESS;
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
}

static bool scan_mode_delimiter(
    TSLexer *lexer,
    ScannerState *state,
    enum ScannerMode expected_mode,
    enum ScannerMode next_mode) {
  if (state->mode != expected_mode || lexer->lookahead != state->delimiter) {
    return false;
  }

  state->mode = next_mode;
  if (next_mode == MODE_NONE) {
    state->delimiter = 0;
  }
  advance(lexer);
  lexer->mark_end(lexer);
  return true;
}

enum RegexBoundaryState {
  REGEX_OUTSIDE_BRACKET,
  REGEX_ESCAPED_CHARACTER,
  REGEX_BRACKET_FIRST,
  REGEX_BRACKET_AFTER_CARET,
  REGEX_BRACKET_BODY,
  REGEX_BRACKET_AFTER_OPEN,
  REGEX_BRACKET_PERIOD,
  REGEX_BRACKET_PERIOD_END,
  REGEX_BRACKET_EQUAL,
  REGEX_BRACKET_EQUAL_END,
  REGEX_BRACKET_COLON,
  REGEX_BRACKET_COLON_END,
};

enum RegexScanResult {
  REGEX_SCAN_EMPTY_TERMINATED,
  REGEX_SCAN_EMPTY_UNTERMINATED,
  REGEX_SCAN_TERMINATED,
  REGEX_SCAN_UNTERMINATED,
};

enum TextScanResult {
  TEXT_SCAN_EMPTY_TERMINATED,
  TEXT_SCAN_EMPTY_UNTERMINATED,
  TEXT_SCAN_TERMINATED,
  TEXT_SCAN_UNTERMINATED,
};

static void consume(TSLexer *lexer) {
  advance(lexer);
  lexer->mark_end(lexer);
}

static bool scan_text_command_start(
    TSLexer *lexer,
    ScannerState *state) {
  if (state->mode != MODE_NONE || lexer->lookahead != '\\') {
    return false;
  }

  advance(lexer);
  lexer->mark_end(lexer);

  if (lexer->eof(lexer)) {
    state->mode = MODE_TEXT;
    return true;
  }

  if (lexer->lookahead == '\r') {
    advance(lexer);
    if (lexer->lookahead != '\n') {
      state->mode = MODE_TEXT_LEADIN;
      return true;
    }
  } else if (lexer->lookahead != '\n') {
    state->mode = MODE_TEXT_LEADIN;
    return true;
  }

  consume(lexer);
  state->mode = MODE_TEXT;
  return true;
}

static bool scan_continued_line_text(
    TSLexer *lexer,
    bool consumed,
    bool escaped) {
  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '\n') {
      if (!escaped) {
        break;
      }

      consume(lexer);
      consumed = true;
      escaped = false;
      continue;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        if (!escaped) {
          break;
        }

        consume(lexer);
        consumed = true;
        escaped = false;
        continue;
      }

      lexer->mark_end(lexer);
      consumed = true;
      escaped = false;
      continue;
    }

    escaped = lexer->lookahead == '\\' ? !escaped : false;
    consume(lexer);
    consumed = true;
  }

  return consumed;
}

static bool scan_text_block(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_TEXT && state->mode != MODE_TEXT_LEADIN) {
    return false;
  }

  if (lexer->eof(lexer)) {
    bool allow_empty = state->mode == MODE_TEXT;
    reset_state(state);
    lexer->mark_end(lexer);
    return allow_empty;
  }

  if (lexer->lookahead == '\n') {
    reset_state(state);
    lexer->mark_end(lexer);
    return true;
  }

  bool consumed = false;
  if (lexer->lookahead == '\r') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead == '\n') {
      reset_state(state);
      return true;
    }
    lexer->mark_end(lexer);
    consumed = true;
  } else if (state->mode == MODE_TEXT_LEADIN) {
    consume(lexer);
    consumed = true;
  }

  scan_continued_line_text(lexer, consumed, false);
  reset_state(state);
  return true;
}

static bool scan_inline_text_block(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->eof(lexer)) {
    return false;
  }

  if (lexer->lookahead == '\\') {
    return false;
  }

  if (lexer->lookahead == '\n') {
    lexer->mark_end(lexer);
    return true;
  }

  if (lexer->lookahead == '\r') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead == '\n') {
      return true;
    }
    lexer->mark_end(lexer);
    return scan_continued_line_text(lexer, true, false);
  }

  return scan_continued_line_text(lexer, false, false);
}

static bool scan_shell_command(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->eof(lexer) || lexer->lookahead == '\n') {
    return false;
  }

  bool consumed = false;

  if (lexer->lookahead == '\r') {
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead == '\n') {
      return false;
    }
    lexer->mark_end(lexer);
    consumed = true;
  }

  /*
   * GNU sed treats an initial backslash as the legacy command-text introducer,
   * just like a/c/i. It is source syntax, so it must not affect the trailing
   * backslash parity that decides whether the shell command continues.
   */
  if (!consumed && lexer->lookahead == '\\') {
    consume(lexer);
    consumed = true;

    if (lexer->eof(lexer)) {
      return true;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        consume(lexer);
      } else {
        lexer->mark_end(lexer);
      }
    } else if (lexer->lookahead == '\n') {
      consume(lexer);
    } else {
      consume(lexer);
    }
  }

  return scan_continued_line_text(lexer, consumed, false);
}

static bool is_gnu_outer_loop_control(int32_t character) {
  return character == '\v' || character == '\f' || character == '\r';
}

/* Consume bare CR, but leave the CR in CRLF for the newline token. */
static bool scan_gnu_outer_loop_whitespace(TSLexer *lexer) {
  if (!is_gnu_outer_loop_control(lexer->lookahead)) {
    return false;
  }

  bool consumed = false;
  for (;;) {
    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed;
      }
      consumed = true;
      lexer->mark_end(lexer);
    } else if (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
               lexer->lookahead == '\v' || lexer->lookahead == '\f') {
      advance(lexer);
      consumed = true;
      lexer->mark_end(lexer);
    } else {
      return consumed;
    }
  }
}

static bool scan_to_physical_line_end(TSLexer *lexer, bool consumed) {
  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '\n') {
      return consumed;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed;
      }
      lexer->mark_end(lexer);
      consumed = true;
      continue;
    }

    consume(lexer);
    consumed = true;
  }

  return consumed;
}

static bool scan_hash_command(
    TSLexer *lexer,
    bool allow_first_line_silent,
    bool allow_comment,
    enum TokenType *symbol) {
  if (lexer->lookahead != '#') {
    return false;
  }

  advance(lexer);

  if (allow_first_line_silent && lexer->lookahead == 'n') {
    consume(lexer);
    *symbol = FIRST_LINE_SILENT;
    return scan_to_physical_line_end(lexer, true);
  }

  if (!allow_comment) {
    return false;
  }

  lexer->mark_end(lexer);
  *symbol = COMMENT_COMMAND;
  return scan_to_physical_line_end(lexer, true);
}

static bool scan_file_argument(TSLexer *lexer) {
  if (lexer->eof(lexer) || lexer->lookahead == ' ' ||
      lexer->lookahead == '\t' || lexer->lookahead == '\n') {
    return false;
  }

  if (lexer->lookahead == '\r') {
    advance(lexer);
    if (lexer->lookahead == '\n') {
      return false;
    }
    lexer->mark_end(lexer);
  } else {
    consume(lexer);
  }

  return scan_to_physical_line_end(lexer, true);
}

static bool is_line_word_boundary(int32_t character) {
  return character == ' ' || character == '\t' || character == ';' ||
         character == '#' || character == '}' || character == '\n';
}

static bool scan_line_word(TSLexer *lexer) {
  bool consumed = false;

  while (!lexer->eof(lexer) &&
         !is_line_word_boundary(lexer->lookahead)) {
    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed;
      }
      lexer->mark_end(lexer);
      consumed = true;
      continue;
    }

    consume(lexer);
    consumed = true;
  }

  return consumed;
}

static bool scan_right_brace(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_NONE) {
    return false;
  }

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }

  if (lexer->lookahead != '}') {
    return false;
  }

  consume(lexer);
  return true;
}

/*
 * Find a sed RE delimiter without assigning meaning to the RE itself. The
 * states below only recognize the POSIX constructs that protect delimiters:
 * escaped characters and bracket expressions, including bracket-period,
 * bracket-equal, and bracket-colon expressions.
 */
static enum RegexBoundaryState regex_state_after_ordinary_character(
    enum RegexBoundaryState state) {
  switch (state) {
    case REGEX_ESCAPED_CHARACTER:
      return REGEX_OUTSIDE_BRACKET;
    case REGEX_BRACKET_FIRST:
    case REGEX_BRACKET_AFTER_CARET:
    case REGEX_BRACKET_AFTER_OPEN:
      return REGEX_BRACKET_BODY;
    case REGEX_BRACKET_PERIOD_END:
      return REGEX_BRACKET_PERIOD;
    case REGEX_BRACKET_EQUAL_END:
      return REGEX_BRACKET_EQUAL;
    case REGEX_BRACKET_COLON_END:
      return REGEX_BRACKET_COLON;
    default:
      return state;
  }
}

static enum RegexScanResult scan_regex_content(
    TSLexer *lexer,
    int32_t delimiter) {
  bool consumed = false;
  enum RegexBoundaryState state = REGEX_OUTSIDE_BRACKET;
  lexer->mark_end(lexer);

  for (;;) {
    if (state == REGEX_OUTSIDE_BRACKET &&
        lexer->lookahead == delimiter) {
      return consumed ? REGEX_SCAN_TERMINATED
                      : REGEX_SCAN_EMPTY_TERMINATED;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead != '\n' ||
          (state == REGEX_ESCAPED_CHARACTER && delimiter == '\r')) {
        lexer->mark_end(lexer);
        consumed = true;
        state = regex_state_after_ordinary_character(state);
        continue;
      }

      if (state == REGEX_ESCAPED_CHARACTER) {
        consume(lexer);
        consumed = true;
        state = REGEX_OUTSIDE_BRACKET;
        continue;
      }

      return consumed ? REGEX_SCAN_UNTERMINATED
                      : REGEX_SCAN_EMPTY_UNTERMINATED;
    }

    if (lexer->eof(lexer) || lexer->lookahead == '\n') {
      if (state == REGEX_ESCAPED_CHARACTER && !lexer->eof(lexer)) {
        consume(lexer);
        consumed = true;
        state = REGEX_OUTSIDE_BRACKET;
        continue;
      }

      return consumed ? REGEX_SCAN_UNTERMINATED
                      : REGEX_SCAN_EMPTY_UNTERMINATED;
    }

    switch (state) {
      case REGEX_OUTSIDE_BRACKET:
        if (lexer->lookahead == '\\') {
          consume(lexer);
          consumed = true;
          state = REGEX_ESCAPED_CHARACTER;
          break;
        }

        if (lexer->lookahead == '[') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_FIRST;
          break;
        }

        consume(lexer);
        consumed = true;
        break;

      case REGEX_ESCAPED_CHARACTER:
        consume(lexer);
        consumed = true;
        state = REGEX_OUTSIDE_BRACKET;
        break;

      case REGEX_BRACKET_FIRST:
        if (lexer->lookahead == '^') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_AFTER_CARET;
        } else if (lexer->lookahead == ']') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_BODY;
        } else if (lexer->lookahead == '[') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_AFTER_OPEN;
        } else {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_BODY;
        }
        break;

      case REGEX_BRACKET_AFTER_CARET:
        if (lexer->lookahead == ']') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_BODY;
        } else if (lexer->lookahead == '[') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_AFTER_OPEN;
        } else {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_BODY;
        }
        break;

      case REGEX_BRACKET_BODY:
        if (lexer->lookahead == ']') {
          consume(lexer);
          consumed = true;
          state = REGEX_OUTSIDE_BRACKET;
        } else if (lexer->lookahead == '[') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_AFTER_OPEN;
        } else {
          /* Delimiters and backslashes are ordinary inside a POSIX bracket. */
          consume(lexer);
          consumed = true;
        }
        break;

      case REGEX_BRACKET_AFTER_OPEN:
        if (lexer->lookahead == '.') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_PERIOD;
        } else if (lexer->lookahead == '=') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_EQUAL;
        } else if (lexer->lookahead == ':') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_COLON;
        } else {
          /* The '[' was an ordinary bracket member. Reprocess this character. */
          state = REGEX_BRACKET_BODY;
        }
        break;

      case REGEX_BRACKET_PERIOD:
        if (lexer->lookahead == '.') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_PERIOD_END;
        } else {
          consume(lexer);
          consumed = true;
        }
        break;

      case REGEX_BRACKET_PERIOD_END:
        if (lexer->lookahead == ']') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_BODY;
        } else {
          state = REGEX_BRACKET_PERIOD;
        }
        break;

      case REGEX_BRACKET_EQUAL:
        if (lexer->lookahead == '=') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_EQUAL_END;
        } else {
          consume(lexer);
          consumed = true;
        }
        break;

      case REGEX_BRACKET_EQUAL_END:
        if (lexer->lookahead == ']') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_BODY;
        } else {
          state = REGEX_BRACKET_EQUAL;
        }
        break;

      case REGEX_BRACKET_COLON:
        if (lexer->lookahead == ':') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_COLON_END;
        } else {
          consume(lexer);
          consumed = true;
        }
        break;

      case REGEX_BRACKET_COLON_END:
        if (lexer->lookahead == ']') {
          consume(lexer);
          consumed = true;
          state = REGEX_BRACKET_BODY;
        } else {
          state = REGEX_BRACKET_COLON;
        }
        break;
    }
  }
}

static enum TextScanResult scan_text_until_delimiter(
    TSLexer *lexer,
    int32_t delimiter,
    bool allow_escaped_newline) {
  bool consumed = false;
  lexer->mark_end(lexer);

  while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
    if (lexer->lookahead == delimiter) {
      return consumed ? TEXT_SCAN_TERMINATED : TEXT_SCAN_EMPTY_TERMINATED;
    }

    if (lexer->lookahead == '\\') {
      consume(lexer);
      consumed = true;

      if (lexer->eof(lexer)) {
        continue;
      }

      if (lexer->lookahead == '\n') {
        if (allow_escaped_newline) {
          consume(lexer);
        }
        continue;
      }

      if (lexer->lookahead == '\r') {
        advance(lexer);
        if (lexer->lookahead == '\n') {
          if (delimiter == '\r') {
            lexer->mark_end(lexer);
            consumed = true;
            continue;
          }

          if (allow_escaped_newline) {
            consume(lexer);
            continue;
          }

          return consumed ? TEXT_SCAN_UNTERMINATED
                          : TEXT_SCAN_EMPTY_UNTERMINATED;
        }

        lexer->mark_end(lexer);
        consumed = true;
        continue;
      }

      if (!lexer->eof(lexer)) {
        consume(lexer);
      }
      continue;
    }

    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead == '\n') {
        return consumed ? TEXT_SCAN_UNTERMINATED
                        : TEXT_SCAN_EMPTY_UNTERMINATED;
      }

      lexer->mark_end(lexer);
      consumed = true;
      continue;
    }

    consume(lexer);
    consumed = true;
  }

  return consumed ? TEXT_SCAN_UNTERMINATED : TEXT_SCAN_EMPTY_UNTERMINATED;
}

static bool scan_regex_text(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_REGEX_ADDRESS &&
      state->mode != MODE_SUBSTITUTE_PATTERN) {
    return false;
  }

  enum RegexScanResult result =
      scan_regex_content(lexer, state->delimiter);

  if (result == REGEX_SCAN_EMPTY_UNTERMINATED) {
    /*
     * Commit the reset with a zero-width recovery token. Returning false would
     * let Tree-sitter restore the scanner state saved after the opening
     * delimiter, which can poison later lines during error recovery.
     */
    reset_state(state);
    return true;
  }

  if (result == REGEX_SCAN_UNTERMINATED) {
    reset_state(state);
  }

  return result == REGEX_SCAN_TERMINATED ||
         result == REGEX_SCAN_UNTERMINATED;
}

static bool scan_replacement_text(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_SUBSTITUTE_REPLACEMENT) {
    return false;
  }

  enum TextScanResult result =
      scan_text_until_delimiter(lexer, state->delimiter, true);

  if (result == TEXT_SCAN_EMPTY_UNTERMINATED) {
    reset_state(state);
    return true;
  }

  if (result == TEXT_SCAN_UNTERMINATED) {
    reset_state(state);
  }

  return result == TEXT_SCAN_TERMINATED ||
         result == TEXT_SCAN_UNTERMINATED;
}

static bool scan_translate_text(TSLexer *lexer, ScannerState *state) {
  if (state->mode != MODE_TRANSLATE_SOURCE &&
      state->mode != MODE_TRANSLATE_DESTINATION) {
    return false;
  }

  enum TextScanResult result =
      scan_text_until_delimiter(lexer, state->delimiter, true);

  if (result == TEXT_SCAN_EMPTY_UNTERMINATED) {
    reset_state(state);
    return true;
  }

  if (result == TEXT_SCAN_UNTERMINATED) {
    reset_state(state);
  }

  return result == TEXT_SCAN_TERMINATED ||
         result == TEXT_SCAN_UNTERMINATED;
}

bool tree_sitter_sed_external_scanner_scan(
    void *payload,
    TSLexer *lexer,
    const bool *valid_symbols) {
  ScannerState *state = payload;

  if (state->mode == MODE_TEXT || state->mode == MODE_TEXT_LEADIN) {
    if (valid_symbols[TEXT_BLOCK] && scan_text_block(lexer, state)) {
      lexer->result_symbol = TEXT_BLOCK;
      return true;
    }
    return false;
  }

  if (valid_symbols[REGEX_CONTENT] && scan_regex_text(lexer, state)) {
    lexer->result_symbol = REGEX_CONTENT;
    return true;
  }

  if (valid_symbols[REPLACEMENT_TEXT] && scan_replacement_text(lexer, state)) {
    lexer->result_symbol = REPLACEMENT_TEXT;
    return true;
  }

  if (valid_symbols[TRANSLATE_TEXT] && scan_translate_text(lexer, state)) {
    lexer->result_symbol = TRANSLATE_TEXT;
    return true;
  }

  if (valid_symbols[REGEX_ADDRESS_END] &&
      scan_mode_delimiter(lexer, state, MODE_REGEX_ADDRESS, MODE_NONE)) {
    lexer->result_symbol = REGEX_ADDRESS_END;
    return true;
  }

  if (valid_symbols[SUBSTITUTE_MIDDLE] &&
      scan_mode_delimiter(
          lexer, state, MODE_SUBSTITUTE_PATTERN,
          MODE_SUBSTITUTE_REPLACEMENT)) {
    lexer->result_symbol = SUBSTITUTE_MIDDLE;
    return true;
  }

  if (valid_symbols[SUBSTITUTE_END] &&
      scan_mode_delimiter(
          lexer, state, MODE_SUBSTITUTE_REPLACEMENT, MODE_NONE)) {
    lexer->result_symbol = SUBSTITUTE_END;
    return true;
  }

  if (valid_symbols[TRANSLATE_MIDDLE] &&
      scan_mode_delimiter(
          lexer, state, MODE_TRANSLATE_SOURCE,
          MODE_TRANSLATE_DESTINATION)) {
    lexer->result_symbol = TRANSLATE_MIDDLE;
    return true;
  }

  if (valid_symbols[TRANSLATE_END] &&
      scan_mode_delimiter(
          lexer, state, MODE_TRANSLATE_DESTINATION, MODE_NONE)) {
    lexer->result_symbol = TRANSLATE_END;
    return true;
  }

  if (state->mode != MODE_NONE) {
    return false;
  }

  if (valid_symbols[LINE_WORD]) {
    bool started_with_cr = lexer->lookahead == '\r';
    if (scan_line_word(lexer)) {
      lexer->result_symbol = LINE_WORD;
      return true;
    }
    if (started_with_cr) {
      return false;
    }
  }

  if (valid_symbols[FILE_ARGUMENT]) {
    bool started_with_cr = lexer->lookahead == '\r';
    if (scan_file_argument(lexer)) {
      lexer->result_symbol = FILE_ARGUMENT;
      return true;
    }
    if (started_with_cr) {
      return false;
    }
  }

  if (valid_symbols[TEXT_COMMAND_START] && lexer->lookahead == '\\') {
    if (scan_text_command_start(lexer, state)) {
      lexer->result_symbol = TEXT_COMMAND_START;
      return true;
    }
    return false;
  }

  if (valid_symbols[TEXT_BLOCK] && scan_inline_text_block(lexer)) {
    lexer->result_symbol = TEXT_BLOCK;
    return true;
  }

  if (valid_symbols[SHELL_COMMAND]) {
    if (scan_shell_command(lexer)) {
      lexer->result_symbol = SHELL_COMMAND;
      return true;
    }
    return false;
  }

  if (lexer->lookahead == '#' &&
      (valid_symbols[FIRST_LINE_SILENT] || valid_symbols[COMMENT_COMMAND])) {
    enum TokenType symbol;
    if (scan_hash_command(
            lexer,
            valid_symbols[FIRST_LINE_SILENT],
            valid_symbols[COMMENT_COMMAND],
            &symbol)) {
      lexer->result_symbol = (TSSymbol)symbol;
      return true;
    }
    return false;
  }

  if (valid_symbols[REGEX_ADDRESS_START] &&
      scan_regex_address_start(lexer, state)) {
    lexer->result_symbol = REGEX_ADDRESS_START;
    return true;
  }

  if (valid_symbols[ESCAPED_REGEX_ADDRESS_START] &&
      lexer->lookahead == '\\') {
    if (scan_escaped_regex_address_start(lexer, state)) {
      lexer->result_symbol = ESCAPED_REGEX_ADDRESS_START;
      return true;
    }
    return false;
  }

  if (valid_symbols[SUBSTITUTE_START] &&
      scan_simple_delimiter(lexer, state, MODE_SUBSTITUTE_PATTERN)) {
    lexer->result_symbol = SUBSTITUTE_START;
    return true;
  }

  if (valid_symbols[TRANSLATE_START] &&
      scan_simple_delimiter(lexer, state, MODE_TRANSLATE_SOURCE)) {
    lexer->result_symbol = TRANSLATE_START;
    return true;
  }

  if (valid_symbols[RIGHT_BRACE] && scan_right_brace(lexer, state)) {
    lexer->result_symbol = RIGHT_BRACE;
    return true;
  }

  if (valid_symbols[GNU_OUTER_LOOP_WHITESPACE] &&
      is_gnu_outer_loop_control(lexer->lookahead)) {
    if (scan_gnu_outer_loop_whitespace(lexer)) {
      lexer->result_symbol = GNU_OUTER_LOOP_WHITESPACE;
      return true;
    }
    return false;
  }

  return false;
}
