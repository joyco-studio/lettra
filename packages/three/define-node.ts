import type { Node, TextureNode } from 'three/webgpu'

/* One contract per reusable TSL node: a stable name, named input types, and
 * an output type, declared once. The declaration drives the implementation
 * signature, consumer input bags, and runtime introspection — no parallel
 * interfaces or debug lists to maintain. */

interface NodeTypeMap {
  float: Node<'float'>
  int: Node<'int'>
  bool: Node<'bool'>
  vec2: Node<'vec2'>
  vec3: Node<'vec3'>
  vec4: Node<'vec4'>
  color: Node<'color'>
  texture: TextureNode
}

export type NodeValueType = keyof NodeTypeMap

export interface NodeDefinition<
  I extends Record<string, NodeValueType> = Record<string, NodeValueType>,
  O extends NodeValueType = NodeValueType,
> {
  name: string
  inputs: I
  output: O
}

type InputBag<I extends Record<string, NodeValueType>> = { [K in keyof I]: NodeTypeMap[I[K]] }

export interface DefinedNode<I extends Record<string, NodeValueType>, O extends NodeValueType> {
  (inputs: InputBag<I>): NodeTypeMap[O]
  /** Frozen copy of the declaration, for contract-driven tooling. */
  readonly definition: Readonly<NodeDefinition<I, O>>
}

/** The input bag type a defined node expects, for consumer-side typing:
 * `const inputs = {...} satisfies NodeInputs<typeof wipeErosion>` */
export type NodeInputs<T extends { definition: NodeDefinition }> = InputBag<T['definition']['inputs']>

/** Declares a reusable TSL node from a single contract. The build callback
 * owns the shader math; consumers own uniforms, textures, materials, and
 * lifecycle. */
export function defineNode<const I extends Record<string, NodeValueType>, const O extends NodeValueType>(
  definition: NodeDefinition<I, O>,
  build: (inputs: InputBag<I>) => NodeTypeMap[NoInfer<O>]
): DefinedNode<I, O> {
  const frozen = Object.freeze({ ...definition, inputs: Object.freeze({ ...definition.inputs }) })
  return Object.assign((inputs: InputBag<I>) => build(inputs), { definition: frozen })
}
