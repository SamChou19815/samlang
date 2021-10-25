all: samlang-runtime/runtime.bc samlang-runtime/example samlang-runtime/libsam-wasm.wasm

samlang-runtime/runtime.bc: samlang-runtime/libsam-base.bc samlang-runtime/libsam.bc
	llvm-link -o $@ samlang-runtime/libsam-base.bc samlang-runtime/libsam.bc

%.bc: %.c
	clang -O3 -m64 -fno-stack-protector -fno-exceptions -emit-llvm $< -c -o $@

%.wasm: %.c
	clang -DNDEBUG -Oz --target=wasm32 -nostdlib -c -o $<.o $<
	wasm-ld --no-entry --import-memory -o $@ $<.o

samlang-runtime/example: samlang-runtime/example.ll samlang-runtime/runtime.bc
	llvm-link -o samlang-runtime/example.bc samlang-runtime/example.ll samlang-runtime/runtime.bc
	llc -O3 -filetype=obj --relocation-model=pic samlang-runtime/example.bc
	gcc -o $@ samlang-runtime/example.o

clean:
	rm -f samlang-runtime/*.bc samlang-runtime/*.o samlang-runtime/*.wasm samlang-runtime/example
