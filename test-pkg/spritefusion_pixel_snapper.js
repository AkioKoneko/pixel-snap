
let imports = {};
imports['__wbindgen_placeholder__'] = module.exports;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let WASM_VECTOR_LEN = 0;

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
/**
 * WASM entry point
 * @param {Uint8Array} input_bytes
 * @param {number | null} [k_colors]
 * @param {number | null} [pixel_size_override]
 * @returns {Uint8Array}
 */
exports.process_image = function(input_bytes, k_colors, pixel_size_override) {
    const ptr0 = passArray8ToWasm0(input_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.process_image(ptr0, len0, isLikeNone(k_colors) ? 0x100000001 : (k_colors) >>> 0, !isLikeNone(pixel_size_override), isLikeNone(pixel_size_override) ? 0 : pixel_size_override);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
};

const ConfigFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_config_free(ptr >>> 0, 1));

class Config {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ConfigFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_config_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get k_colors() {
        const ret = wasm.__wbg_get_config_k_colors(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set k_colors(arg0) {
        wasm.__wbg_set_config_k_colors(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number | undefined}
     */
    get pixel_size_override() {
        const ret = wasm.__wbg_get_config_pixel_size_override(this.__wbg_ptr);
        return ret[0] === 0 ? undefined : ret[1];
    }
    /**
     * @param {number | null} [arg0]
     */
    set pixel_size_override(arg0) {
        wasm.__wbg_set_config_pixel_size_override(this.__wbg_ptr, !isLikeNone(arg0), isLikeNone(arg0) ? 0 : arg0);
    }
}
if (Symbol.dispose) Config.prototype[Symbol.dispose] = Config.prototype.free;

exports.Config = Config;

exports.__wbg___wbindgen_throw_b855445ff6a94295 = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

exports.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

exports.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
    ;
};

const wasmPath = `${__dirname}/spritefusion_pixel_snapper_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
const wasm = exports.__wasm = new WebAssembly.Instance(wasmModule, imports).exports;

wasm.__wbindgen_start();

