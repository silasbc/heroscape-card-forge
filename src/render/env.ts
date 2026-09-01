// What a renderer needs from the outside world: loaded images and derived layers.
import type { Silhouette } from '../cutout/silhouette'

export interface RenderEnv {
  img(id?: string): HTMLImageElement | undefined
  asset(path: string): HTMLImageElement | undefined
  silhouette(imageId: string | undefined, threshold: number): Silhouette | undefined
  /** silhouette filled with a colour (cached) */
  tinted(sil: Silhouette, color: string): HTMLCanvasElement
  /** paint image masked by the silhouette and tinted (cached per paint image) */
  maskedPaint(sil: Silhouette, paint: HTMLImageElement, color: string): HTMLCanvasElement
}
