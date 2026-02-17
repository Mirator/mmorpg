declare module 'fbx2gltf' {
  export default function convert(
    src: string,
    dest: string,
    options?: unknown[]
  ): Promise<unknown>;
}
