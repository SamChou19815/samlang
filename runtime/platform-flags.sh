#!/bin/sh
#
# This script outputs the appropriate ABI tweak environmental variables
# based on the current system
#
# Override to force -m32 if autodetection fails
ABI_FLAG=
CPU=$(uname -m)
OS=$(uname)
# echo "OS = $OS"
if [ "$OS" != Darwin ]; then
    OS=$(uname -o)
fi

# The -Wa is kind of overkill; it's there to help the example determine
# whether it needs to use _printf or printf
if [ $OS = Cygwin ]; then
    ABI_FLAG="$ABI_FLAG -Wa,--defsym -Wa,win32=1"
elif [ $OS = Darwin ]; then
    ABI_FLAG="$ABI_FLAG -arch $CPU"
fi

echo $ABI_FLAG
