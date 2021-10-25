all: samlang-runtime/libsam-wasm.wasm

%.wasm: %.c
	clang -DNDEBUG -Oz --target=wasm32 -nostdlib -c -o $<.o $<
	wasm-ld --no-entry --import-memory -o $@ $<.o

clean:
	rm -f samlang-runtime/*.o samlang-runtime/*.wasm
