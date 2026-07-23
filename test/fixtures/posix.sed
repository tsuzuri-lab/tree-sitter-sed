#n
1,3d
/^route:/p
s#^/api/#route:#gp
y/abc/ABC/
{
  /start/,/end/p
}
:done
b done
