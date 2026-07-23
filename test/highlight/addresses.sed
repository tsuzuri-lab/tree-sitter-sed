1,3d
# <- number
# ^ number
#  ^ function.builtin

$p
# <- constant.builtin

/foo/p
# <- string.regexp
#    ^ function.builtin

1 !p
# ^ operator
#  ^ function.builtin

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
