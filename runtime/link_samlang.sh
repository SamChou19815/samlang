#!/bin/sh
#
# This is a very simple script that uses gcc to link in a given .s
# file to the SAMLANG runtime library.
#
# Use this like ./link_samlang.sh -o binary foo.s
#
DIR=$(dirname $0)
ABI_FLAG=$($DIR/platform-flags.sh)

# echo "ABI_FLAG = $ABI_FLAG"

gcc $ABI_FLAG "$@" -L$DIR -lsam -lpthread 2>&1
