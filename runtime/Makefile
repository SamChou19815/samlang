all: libsam.a libsam.bc

libsam.bc: libsam/libsam.bc libsam/gc.bc
	llvm-link -o $@ libsam/libsam.bc libsam/gc.bc

libsam.a: libsam/libsam.o libsam/gc.o
	ar rcs $@ libsam/libsam.o libsam/gc.o

example: libsam/example.ll libsam/gc.bc libsam.bc
	llvm-as libsam/example.ll
	llvm-link -o example.bc libsam/example.bc libsam.bc
	llc -O3 -filetype=obj --relocation-model=pic example.bc
	gcc -o $@ example.o

%.o: %.c
	gcc -Wall -O2 -m64 -fno-stack-protector -fno-exceptions -c -o $@ $<

%.bc: %.c
	clang -O3 -m64 -fno-stack-protector -fno-exceptions -emit-llvm $< -c -o $@

clean:
	rm -f libsam.a libsam.bc example
	rm -f libsam/*.o libsam/*.bc libsam/*.s *.o *.bc
	rm -f *~
