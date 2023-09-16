// loader.js
async function interpretWebAssemblyModule(emittedWasmBinary) {
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536 });
  function pointerToString(p) {
    const mem = new Uint8Array(memory.buffer);
    const length = mem[p + 4] | mem[p + 5] << 8 | mem[p + 6] << 16 | mem[p + 7] << 24;
    const characterCodes = Array.from(mem.subarray(p + 8, p + 8 + length).values());
    return String.fromCharCode(...characterCodes);
  }
  let printed = "";
  const builtins = {
    __Process$println(_, p) {
      printed += pointerToString(p);
      printed += "\n";
      return 0;
    },
    __Process$panic(_, p) {
      throw new Error(pointerToString(p));
    }
  };
  const codeModule = await WebAssembly.instantiate(emittedWasmBinary, {
    env: { memory },
    builtins
  });
  const exports = codeModule.instance.exports;
  exports["_Demo_Main$main"]?.();
  return printed;
}

// samlang-demo/samlang_wasm.js
var getObject = function(idx) {
  return heap[idx];
};
var dropObject = function(idx) {
  if (idx < 132)
    return;
  heap[idx] = heap_next;
  heap_next = idx;
};
var takeObject = function(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
};
var addHeapObject = function(obj) {
  if (heap_next === heap.length)
    heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
};
var getUint8Memory0 = function() {
  if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
};
var getStringFromWasm0 = function(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
};
var debugString = function(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1;i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}\n${val.stack}`;
  }
  return className;
};
var passStringToWasm0 = function(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8Memory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8Memory0();
  let offset = 0;
  for (;offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127)
      break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
};
var getInt32Memory0 = function() {
  if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachedInt32Memory0;
};
function compile(source) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
    const len0 = WASM_VECTOR_LEN;
    wasm.compile(retptr, ptr0, len0);
    var r0 = getInt32Memory0()[retptr / 4 + 0];
    var r1 = getInt32Memory0()[retptr / 4 + 1];
    var r2 = getInt32Memory0()[retptr / 4 + 2];
    if (r2) {
      throw takeObject(r1);
    }
    return SourcesCompilationResult.__wrap(r0);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function typeCheck(source) {
  const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.typeCheck(ptr0, len0);
  return takeObject(ret);
}
function queryType(source, line, column) {
  const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.queryType(ptr0, len0, line, column);
  return takeObject(ret);
}
function queryDefinitionLocation(source, line, column) {
  const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.queryDefinitionLocation(ptr0, len0, line, column);
  return takeObject(ret);
}
function autoComplete(source, line, column) {
  const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.autoComplete(ptr0, len0, line, column);
  return takeObject(ret);
}
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        if (module.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
var __wbg_get_imports = function() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject(arg0);
  };
  imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
    const ret = getObject(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_number_new = function(arg0) {
    const ret = arg0;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_set_841ac57cff3d672b = function(arg0, arg1, arg2) {
    getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
  };
  imports.wbg.__wbg_new_898a68150f225f2e = function() {
    const ret = new Array;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_b51585de1b234aff = function() {
    const ret = new Object;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_set_502d29070ea18557 = function(arg0, arg1, arg2) {
    getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
  };
  imports.wbg.__wbg_buffer_085ec1f694018c4f = function(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_6da8e527659b86aa = function(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_8125e318e6245eed = function(arg0) {
    const ret = new Uint8Array(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
    const ret = debugString(getObject(arg1));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
    const len1 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len1;
    getInt32Memory0()[arg0 / 4 + 0] = ptr1;
  };
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return addHeapObject(ret);
  };
  return imports;
};
var __wbg_init_memory = function(imports, maybe_memory) {
};
var __wbg_finalize_init = function(instance, module) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module;
  cachedInt32Memory0 = null;
  cachedUint8Memory0 = null;
  return wasm;
};
async function __wbg_init(input) {
  if (wasm !== undefined)
    return wasm;
  if (typeof input === "undefined") {
    input = new URL("samlang_wasm_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof input === "string" || typeof Request === "function" && input instanceof Request || typeof URL === "function" && input instanceof URL) {
    input = fetch(input);
  }
  __wbg_init_memory(imports);
  const { instance, module } = await __wbg_load(await input, imports);
  return __wbg_finalize_init(instance, module);
}
var wasm;
var heap = new Array(128).fill(undefined);
heap.push(undefined, null, true, false);
var heap_next = heap.length;
var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder.decode();
}
var cachedUint8Memory0 = null;
var WASM_VECTOR_LEN = 0;
var cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
  throw Error("TextEncoder not available");
} };
var encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
  return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
  const buf = cachedTextEncoder.encode(arg);
  view.set(buf);
  return {
    read: arg.length,
    written: buf.length
  };
};
var cachedInt32Memory0 = null;

class SourcesCompilationResult {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(SourcesCompilationResult.prototype);
    obj.__wbg_ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_sourcescompilationresult_free(ptr);
  }
  get ts_code() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.__wbg_get_sourcescompilationresult_ts_code(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export_2(deferred1_0, deferred1_1, 1);
    }
  }
  set ts_code(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_sourcescompilationresult_ts_code(this.__wbg_ptr, ptr0, len0);
  }
  get wasm_bytes() {
    const ret = wasm.__wbg_get_sourcescompilationresult_wasm_bytes(this.__wbg_ptr);
    return takeObject(ret);
  }
  set wasm_bytes(arg0) {
    wasm.__wbg_set_sourcescompilationresult_wasm_bytes(this.__wbg_ptr, addHeapObject(arg0));
  }
}
var samlang_wasm_default = __wbg_init;

// lazy-index.js
async function init(url) {
  await samlang_wasm_default(url);
}
async function compile2(source) {
  try {
    const compilationResult = compile(source);
    const result = {
      tsCode: compilationResult.ts_code,
      interpreterResult: await interpretWebAssemblyModule(compilationResult.wasm_bytes)
    };
    compilationResult.free();
    return result;
  } catch (e) {
    return e;
  }
}
function typeCheck2(source) {
  return typeCheck(source) || [];
}
function queryType2(source, line, number) {
  return queryType(source, line, number);
}
function queryDefinitionLocation2(source, line, number) {
  return queryDefinitionLocation(source, line, number);
}
function autoComplete2(source, line, number) {
  return autoComplete(source, line, number);
}
export {
  typeCheck2 as typeCheck,
  queryType2 as queryType,
  queryDefinitionLocation2 as queryDefinitionLocation,
  init,
  compile2 as compile,
  autoComplete2 as autoComplete
};
