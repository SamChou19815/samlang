# Compiler

## Assembly Generation

### Workflow

1. Tiling
2. Register Allocation
3. Calling Convention Fix

### Calling Convention

We consistently use this calling convention:

| type of vars | mem reference |
| ------------ | ------------- |
| extra args & ret | [rbp + 16] ... |
| return address | [rbp + 8] | <-- rsp right after call, right before return |
| saved rbp | [rbp] | <-- rsp right after pushing rbp, right before popping |
| spilled vars | [rbp - 8] ... |
| empty space for odd # of spill | <-- rsp during normal usage |
| empty space for odd # of args + ret | |
| extra args & ret | [rsp + 0] ... | <-- rsp after setup of call |
