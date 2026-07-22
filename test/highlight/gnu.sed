0 ~ 3 p
# <- number
# ^ operator
#   ^ number
#     ^ function.builtin

1,+4p
# ^ operator
#  ^ number
#   ^ function.builtin

1,~4p
# ^ operator
#  ^ number
#   ^ function.builtin

/x/IMp
# <- string.regexp
#  ^ attribute
#   ^ attribute
#    ^ function.builtin

Q 42
# <- function.builtin
# ^ number

q 7
# <- function.builtin
# ^ number

l 80
# <- function.builtin
# ^ number

F
# <- function.builtin

T retry
# <- function.builtin
# ^ constant

v 4.0
# <- function.builtin
# ^ constant

R input.txt
# <- function.builtin
# ^ string.special

W output.txt
# <- function.builtin
# ^ string.special

e echo hi
# <- function.builtin
# ^ string

z
# <- function.builtin

s/a/b/IMe
# <- function.builtin
#  ^ string.regexp
#   ^ string
#     ^ attribute
#      ^ attribute
#       ^ attribute
