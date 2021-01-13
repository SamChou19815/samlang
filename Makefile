all: samlang-runtime/runtime.bc samlang-runtime/example

samlang-runtime/runtime.bc: samlang-runtime/libsam.bc samlang-runtime/gc.bc
	llvm-link -o $@ samlang-runtime/libsam.bc samlang-runtime/gc.bc

%.bc: %.c
	clang -O3 -m64 -fno-stack-protector -fno-exceptions -emit-llvm $< -c -o $@

samlang-runtime/example: samlang-runtime/example.ll samlang-runtime/runtime.bc
	llvm-link -o samlang-runtime/example.bc samlang-runtime/example.ll samlang-runtime/runtime.bc
	llc -O3 -filetype=obj --relocation-model=pic samlang-runtime/example.bc
	gcc -o $@ samlang-runtime/example.o

clean:
	rm -f samlang-runtime/*.bc samlang-runtime/*.o samlang-runtime/example

