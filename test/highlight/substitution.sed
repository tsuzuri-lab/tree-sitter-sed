s/foo/bar/g
# <- function.builtin
#  ^ string.regexp
#      ^ string
#         ^ attribute

s/a/b/2
#     ^ number

s/a/b/p
#     ^ attribute

s/a/b/w output.txt
#     ^ function.builtin
#        ^ string.special

s/a/b/IMe
# <- function.builtin
#  ^ string.regexp
#   ^ string
#     ^ attribute
#      ^ attribute
#       ^ attribute
