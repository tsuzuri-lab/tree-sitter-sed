r input.txt
# <- function.builtin
#  ^ string.special

w output.txt
# <- function.builtin
#  ^ string.special

y/abc/ABC/
# <- function.builtin
#  ^ string
#      ^ string

:done
# <- function.builtin
# ^ constant

b done
# <- function.builtin
# ^ constant

t retry
# <- function.builtin
# ^ constant

a\
hello
# <- string

a appended
# <- function.builtin
# ^ string

i inserted
# <- function.builtin
# ^ string

c changed
# <- function.builtin
# ^ string
