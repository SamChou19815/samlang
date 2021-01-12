all: libsam.bc example

libsam.bc: libsam/libsam.bc libsam/gc.bc
	llvm-link -o $@ libsam/libsam.bc libsam/gc.bc

%.bc: %.c
	clang -O3 -m64 -fno-stack-protector -fno-exceptions -emit-llvm $< -c -o $@

example: example.ll libsam/gc.bc libsam.bc
	llvm-link -o example.bc example.ll libsam.bc
	llc -O3 -filetype=obj --relocation-model=pic example.bc
	gcc -o $@ example.o

clean:
	rm -f libsam.a libsam.bc example
	rm -f libsam/*.bc *.o *.bc
	rm -f *~
