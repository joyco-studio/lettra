import { version } from '../../package.json'

export const VERSION = version
export * from './types'
export { parseFont, loadFont, fromBMFont, isBMFont, getFontLookup } from './parse'
export type { FontLookup } from './parse'
export { wrapLines } from './wrap'
export type { WrappedLine, MeasureFn, WrapOptions } from './wrap'
export { layout } from './layout'
