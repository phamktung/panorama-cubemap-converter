"use client"
import JSZip from "jszip"

export class PanoramaConverter {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private tileConfigs = [
    { tileSize: 256, size: 256, fallbackOnly: true },
    { tileSize: 512, size: 512 },
    { tileSize: 512, size: 1024 },
    { tileSize: 512, size: 2048 },
  ]

  private faceNames = ["r", "l", "u", "d", "f", "b"] // right, left, up, down, front, back

  constructor() {
    this.canvas = document.createElement("canvas")
    this.ctx = this.canvas.getContext("2d")!
  }

  async convertToCubemap(file: File, onProgress?: (progress: number) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = "anonymous"

      img.onload = async () => {
        try {
          const result = await this.processImage(img, onProgress)
          resolve(result)
        } catch (error) {
          reject(error)
        }
      }

      img.onerror = () => reject(new Error("Failed to load image"))
      img.src = URL.createObjectURL(file)
    })
  }

  private async processImage(img: HTMLImageElement, onProgress?: (progress: number) => void): Promise<any> {
    const width = img.width
    const height = img.height

    const maxZoom = this.tileConfigs.length - 1
    const zoomLevels = maxZoom + 1

    const tiles: { [key: string]: string } = {}
    let totalTiles = 0
    let processedTiles = 0

    for (let z = 0; z <= maxZoom; z++) {
      const config = this.tileConfigs[z]
      const tilesPerSide = Math.ceil(config.size / config.tileSize)
      totalTiles += 6 * tilesPerSide * tilesPerSide
    }

    for (let z = 0; z <= maxZoom; z++) {
      const config = this.tileConfigs[z]
      const tilesPerSide = Math.ceil(config.size / config.tileSize)
      const faceSize = config.size

      // Generate each cube face
      for (let face = 0; face < 6; face++) {
        const faceCanvas = this.generateCubeFace(img, face, faceSize)
        const faceName = this.faceNames[face]

        // Split face into tiles
        for (let y = 0; y < tilesPerSide; y++) {
          for (let x = 0; x < tilesPerSide; x++) {
            const tileCanvas = document.createElement("canvas")
            tileCanvas.width = config.tileSize
            tileCanvas.height = config.tileSize
            const tileCtx = tileCanvas.getContext("2d")!

            tileCtx.imageSmoothingEnabled = false

            const sourceX = x * config.tileSize
            const sourceY = y * config.tileSize
            const sourceWidth = Math.min(config.tileSize, faceSize - sourceX)
            const sourceHeight = Math.min(config.tileSize, faceSize - sourceY)

            tileCtx.drawImage(faceCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)

            const tileKey = `${z}/${faceName}/${y}/${x}`
            tiles[tileKey] = tileCanvas.toDataURL("image/jpeg", 1.0)

            processedTiles++
            if (onProgress) {
              onProgress((processedTiles / totalTiles) * 100)
            }
          }
        }
      }
    }

    // Create zip file
    const zipUrl = await this.createZipFile(tiles)

    return {
      tiles,
      zipUrl,
      totalTiles,
      zoomLevels,
      maxZoom,
      tileConfigs: this.tileConfigs,
    }
  }

  private generateCubeFace(img: HTMLImageElement, face: number, size: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")!

    ctx.imageSmoothingEnabled = false

    const imgData = this.getImageData(img)
    const faceData = ctx.createImageData(size, size)

    // Convert equirectangular to cube face with bilinear interpolation
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [u, v] = this.faceUVToEquirectangular(face, x / size, y / size)
        const pixel = this.sampleEquirectangularBilinear(imgData, u, v, img.width, img.height)

        const idx = (y * size + x) * 4
        faceData.data[idx] = pixel[0]
        faceData.data[idx + 1] = pixel[1]
        faceData.data[idx + 2] = pixel[2]
        faceData.data[idx + 3] = 255
      }
    }

    ctx.putImageData(faceData, 0, 0)
    return canvas
  }

  private getImageData(img: HTMLImageElement): ImageData {
    const canvas = document.createElement("canvas")
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, img.width, img.height)
  }

  private faceUVToEquirectangular(face: number, u: number, v: number): [number, number] {
    // Convert cube face UV to 3D direction
    let x: number, y: number, z: number

    // Map UV to [-1, 1] range
    const uc = 2 * u - 1
    const vc = 2 * v - 1

    switch (face) {
      case 0: // Right (+X)
        x = 1
        y = -vc
        z = -uc
        break
      case 1: // Left (-X)
        x = -1
        y = -vc
        z = uc
        break
      case 2: // Up (+Y)
        x = uc
        y = 1
        z = vc
        break
      case 3: // Down (-Y)
        x = uc
        y = -1
        z = -vc
        break
      case 4: // Front (+Z)
        x = uc
        y = -vc
        z = 1
        break
      case 5: // Back (-Z)
        x = -uc
        y = -vc
        z = -1
        break
      default:
        x = y = z = 0
    }

    // Convert 3D direction to equirectangular coordinates
    const theta = Math.atan2(z, x)
    const phi = Math.acos(y / Math.sqrt(x * x + y * y + z * z))

    const eqU = (theta + Math.PI) / (2 * Math.PI)
    const eqV = phi / Math.PI

    return [eqU, eqV]
  }

  private sampleEquirectangularBilinear(
    imgData: ImageData,
    u: number,
    v: number,
    width: number,
    height: number,
  ): [number, number, number] {
    // Clamp coordinates to valid range
    u = Math.max(0, Math.min(1, u))
    v = Math.max(0, Math.min(1, v))

    const x = u * (width - 1)
    const y = v * (height - 1)

    const x1 = Math.floor(x)
    const y1 = Math.floor(y)
    const x2 = Math.min(x1 + 1, width - 1)
    const y2 = Math.min(y1 + 1, height - 1)

    const fx = x - x1
    const fy = y - y1

    // Get four corner pixels
    const getPixel = (px: number, py: number): [number, number, number] => {
      const idx = (py * width + px) * 4
      return [imgData.data[idx], imgData.data[idx + 1], imgData.data[idx + 2]]
    }

    const p11 = getPixel(x1, y1)
    const p21 = getPixel(x2, y1)
    const p12 = getPixel(x1, y2)
    const p22 = getPixel(x2, y2)

    // Bilinear interpolation
    const interpolate = (c1: number, c2: number, c3: number, c4: number): number => {
      const i1 = c1 * (1 - fx) + c2 * fx
      const i2 = c3 * (1 - fx) + c4 * fx
      return i1 * (1 - fy) + i2 * fy
    }

    return [
      Math.round(interpolate(p11[0], p21[0], p12[0], p22[0])),
      Math.round(interpolate(p11[1], p21[1], p12[1], p22[1])),
      Math.round(interpolate(p11[2], p21[2], p12[2], p22[2])),
    ]
  }

  private sampleEquirectangular(
    imgData: ImageData,
    u: number,
    v: number,
    width: number,
    height: number,
  ): [number, number, number] {
    const x = Math.floor(u * width) % width
    const y = Math.floor(v * height) % height
    const idx = (y * width + x) * 4

    return [imgData.data[idx], imgData.data[idx + 1], imgData.data[idx + 2]]
  }

  private async createZipFile(tiles: { [key: string]: string }): Promise<string> {
    const zip = new JSZip()

    // Add each tile as a separate image file
    for (const [tilePath, dataUrl] of Object.entries(tiles)) {
      // Convert data URL to binary data
      const base64Data = dataUrl.split(",")[1]
      const binaryData = atob(base64Data)
      const bytes = new Uint8Array(binaryData.length)

      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i)
      }

      // Add file to ZIP with proper path structure
      zip.file(`${tilePath}.jpg`, bytes)
    }

    // Add configuration file
    const config = {
      format: "marzipano-cubemap",
      tileStructure: "{z}/{f}/{y}/{x}.jpg (where f = r,l,u,d,f,b)",
      faceMapping: {
        r: "right (+X)",
        l: "left (-X)",
        u: "up (+Y)",
        d: "down (-Y)",
        f: "front (+Z)",
        b: "back (-Z)",
      },
      tileConfigs: this.tileConfigs,
      description: "Marzipano cubemap tiles generated from panoramic image with maximum quality preservation",
    }

    zip.file("config.json", JSON.stringify(config, null, 2))

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: "blob" })
    return URL.createObjectURL(zipBlob)
  }
}
