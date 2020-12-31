all: libsam.a

libsam.a: libsam/libsam.o libsam/gc.o
	ar rcs $@ libsam/libsam.o libsam/gc.o

example: libsam/example.ll
	llvm-as libsam/example.ll
	llc -O3 --relocation-model=pic libsam/example.bc
	gcc -o $@ libsam/example.s -L. -lsam -lpthread

%.o: %.c
	gcc -Wall -O2 -m64 -fno-stack-protector -fno-exceptions -c -o $@ $<

%.bc: %.c
	clang -O3 -m64 -fno-stack-protector -fno-exceptions -emit-llvm $< -c -o $@

clean:
	rm -f libsam.a libsam.bc example
	rm -f libsam/*.o libsam/*.bc libsam/*.s
	rm -f *~
