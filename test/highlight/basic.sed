#n
# <- comment

1,3d
# <- number
# ^ number
#  ^ function.builtin

/foo/p
# <- string.regexp
#    ^ function.builtin

s/foo/bar/g
# <- function.builtin
#  ^ string.regexp
#      ^ string
#         ^ attribute

r input.txt
# <- function.builtin
#  ^ string.special

:done
# <- function.builtin
# ^ constant

b done
# <- function.builtin
# ^ constant

{
# <- punctuation.bracket
p
# <- function.builtin
}
# <- punctuation.bracket

a\
hello
# <- string
