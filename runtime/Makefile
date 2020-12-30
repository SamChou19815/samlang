all: libsam.a libsam.bc

libsam.bc: libsam/libsam.bc libsam/gc.bc
	llvm-link -o $@ libsam/libsam.bc libsam/gc.bc

libsam.a: libsam/libsam.o libsam/gc.o
	ar rcs $@ libsam/libsam.o libsam/gc.o

example: libsam.bc libsam/example.ll
	llvm-as libsam/example.ll
	llvm-link -o example.bc libsam/example.bc libsam.bc
	llc -filetype=obj example.bc
	rm example.bc
	gcc -o $@ example.o
	rm example.o

%.o: %.c
	gcc -Wall -O2 -m64 -c -o $@ $<

%.bc: %.c
	clang -O3 -emit-llvm $< -c -o $@

clean:
	rm -f libsam.a libsam.bc
	rm -f libsam/*.o libsam/*.bc
	rm -f *~
