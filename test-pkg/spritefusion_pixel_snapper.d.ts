/* tslint:disable */
/* eslint-disable */
/**
 * WASM entry point
 */
export function process_image(input_bytes: Uint8Array, k_colors?: number | null, pixel_size_override?: number | null): Uint8Array;
export class Config {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  k_colors: number;
  get pixel_size_override(): number | undefined;
  set pixel_size_override(value: number | null | undefined);
}
