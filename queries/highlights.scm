[
  (first_line_silent)
  (comment_command)
] @comment

[
  (line_number_address)
  (step_value)
  (line_offset)
  (occurrence_flag)
  (exit_status)
  (line_wrap_length)
] @number

(last_line_address) @constant.builtin

(regex) @string.regexp

[
  (replacement)
  (translate_source)
  (translate_destination)
  (text_block)
  (shell_command)
] @string

(file_argument) @string.special
[
  (label)
  (version_argument)
] @constant
(negation) @operator

[
  (delete_command)
  (print_command)
  (next_command)
  (delete_first_line_command)
  (get_command)
  (get_append_command)
  (hold_command)
  (hold_append_command)
  (next_append_command)
  (print_first_line_command)
  (exchange_command)
  (line_number_command)
  (file_name_command)
  (clear_command)
] @function.builtin

(quit_command "q" @function.builtin)
(silent_quit_command "Q" @function.builtin)
(list_command "l" @function.builtin)
(read_command "r" @function.builtin)
(read_line_command "R" @function.builtin)
(write_command "w" @function.builtin)
(write_first_line_command "W" @function.builtin)
(substitute_command "s" @function.builtin)
(translate_command "y" @function.builtin)
(label_command ":" @function.builtin)
(branch_command "b" @function.builtin)
(test_command "t" @function.builtin)
(test_failure_command "T" @function.builtin)
(version_command "v" @function.builtin)
(append_command "a" @function.builtin)
(insert_command "i" @function.builtin)
(change_command "c" @function.builtin)
(execute_command "e" @function.builtin)
(write_flag "w" @function.builtin)

[
  (global_flag)
  (ignore_case_flag)
  (multiline_flag)
  (execute_flag)
  (print_flag)
] @attribute

(periodic_address "~" @operator)
(next_multiple_address "~" @operator)
(relative_address "+" @operator)

(block_command
  [
    "{"
    "}"
  ] @punctuation.bracket)

(address_range "," @punctuation.delimiter)

((separator) @punctuation.delimiter
  (#match? @punctuation.delimiter ";"))
