# GNU sed syntax smoke fixture
0~3p
1,+4p
1,~5p
/warning/IMp
q 23
Q 24
l 80
F
T retry;z
v 4.0
R input.txt
W output.txt
s/error/ok/I M e p
e printf 'generated\n'
1,2a appended text
{
  :retry ; b retry ; t retry ; T retry
}
