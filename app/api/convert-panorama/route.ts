import { type NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"

interface TileConfig {
  tileSize: number
  size: number
  fallbackOnly?: boolean
}

class ServerPanoramaConverter {
  private tileConfigs: TileConfig[] = [
    { tileSize: 256, size: 256, fallbackOnly: true },
    { tileSize: 512, size: 512 },
    { tileSize: 512, size: 1024 },
    { tileSize: 512, size: 2048 },
  ]

  private faceNames = ["r", "l", "u", "d", "f", "b"] // right, left, up, down, front, back

  async convertFromUrl(imageUrl: string): Promise<{
    zipBuffer: Buffer
    totalTiles: number
    zoomLevels: number
    maxZoom: number
  }> {
    console.log("[v0] Starting conversion for URL:", imageUrl)

    try {
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
      }

      console.log("[v0] Image fetched successfully, content-type:", response.headers.get("content-type"))

      const imageBuffer = await response.arrayBuffer()
      console.log("[v0] Image buffer size:", imageBuffer.byteLength)

      const imageBlob = new Blob([imageBuffer])

      if (typeof OffscreenCanvas === "undefined") {
        throw new Error("OffscreenCanvas is not available in this environment")
      }

      const canvas = new OffscreenCanvas(1, 1)
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        throw new Error("Failed to get 2D context from OffscreenCanvas")
      }

      console.log("[v0] Creating ImageBitmap...")

      let imageBitmap: ImageBitmap
      try {
        imageBitmap = await createImageBitmap(imageBlob)
        console.log("[v0] ImageBitmap created successfully, dimensions:", imageBitmap.width, "x", imageBitmap.height)
      } catch (error) {
        console.error("[v0] Failed to create ImageBitmap:", error)
        throw new Error(`Failed to create ImageBitmap: ${error instanceof Error ? error.message : "Unknown error"}`)
      }

      const result = await this.processImage(imageBitmap)
      console.log("[v0] Conversion completed successfully")
      return result
    } catch (error) {
      console.error("[v0] Error in convertFromUrl:", error)
      throw error
    }
  }

  private async processImage(img: ImageBitmap): Promise<{
    zipBuffer: Buffer
    totalTiles: number
    zoomLevels: number
    maxZoom: number
  }> {
    console.log("[v0] Processing image with dimensions:", img.width, "x", img.height)

    const width = img.width
    const height = img.height

    const maxZoom = this.tileConfigs.length - 1
    const zoomLevels = maxZoom + 1

    const tiles: { [key: string]: Buffer } = {}
    let totalTiles = 0

    for (let z = 0; z <= maxZoom; z++) {
      const config = this.tileConfigs[z]
      const tilesPerSide = Math.ceil(config.size / config.tileSize)
      totalTiles += 6 * tilesPerSide * tilesPerSide
    }

    console.log("[v0] Will generate", totalTiles, "tiles across", zoomLevels, "zoom levels")

    try {
      for (let z = 0; z <= maxZoom; z++) {
        console.log("[v0] Processing zoom level", z)
        const config = this.tileConfigs[z]
        const tilesPerSide = Math.ceil(config.size / config.tileSize)
        const faceSize = config.size

        // Generate each cube face
        for (let face = 0; face < 6; face++) {
          console.log("[v0] Generating face", face, "for zoom level", z)
          const faceImageData = await this.generateCubeFace(img, face, faceSize)
          const faceName = this.faceNames[face]

          // Split face into tiles
          for (let y = 0; y < tilesPerSide; y++) {
            for (let x = 0; x < tilesPerSide; x++) {
              const tileBuffer = await this.createTile(faceImageData, x, y, config, faceSize)
              const tileKey = `${z}/${faceName}/${y}/${x}`
              tiles[tileKey] = tileBuffer
            }
          }
        }
      }

      console.log("[v0] All tiles generated, creating ZIP file...")
      const zipBuffer = await this.createZipFile(tiles)
      console.log("[v0] ZIP file created, size:", zipBuffer.length)

      return {
        zipBuffer,
        totalTiles,
        zoomLevels,
        maxZoom,
      }
    } catch (error) {
      console.error("[v0] Error in processImage:", error)
      throw error
    }
  }

  private async generateCubeFace(img: ImageBitmap, face: number, size: number): Promise<ImageData> {
    try {
      const canvas = new OffscreenCanvas(size, size)
      const ctx = canvas.getContext("2d")!

      const sourceCanvas = new OffscreenCanvas(img.width, img.height)
      const sourceCtx = sourceCanvas.getContext("2d")!
      sourceCtx.drawImage(img, 0, 0)
      const imgData = sourceCtx.getImageData(0, 0, img.width, img.height)

      const faceData = ctx.createImageData(size, size)

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

      return faceData
    } catch (error) {
      console.error("[v0] Error generating cube face", face, ":", error)
      throw error
    }
  }

  private async createTile(
    faceImageData: ImageData,
    tileX: number,
    tileY: number,
    config: TileConfig,
    faceSize: number,
  ): Promise<Buffer> {
    try {
      const canvas = new OffscreenCanvas(config.tileSize, config.tileSize)
      const ctx = canvas.getContext("2d")!

      const sourceX = tileX * config.tileSize
      const sourceY = tileY * config.tileSize
      const sourceWidth = Math.min(config.tileSize, faceSize - sourceX)
      const sourceHeight = Math.min(config.tileSize, faceSize - sourceY)

      // Extract tile data from face
      const tileData = ctx.createImageData(config.tileSize, config.tileSize)

      for (let i = 0; i < tileData.data.length; i += 4) {
        tileData.data[i] = 0 // R
        tileData.data[i + 1] = 0 // G
        tileData.data[i + 2] = 0 // B
        tileData.data[i + 3] = 255 // A
      }

      for (let y = 0; y < sourceHeight; y++) {
        for (let x = 0; x < sourceWidth; x++) {
          const sourceIdx = ((sourceY + y) * faceSize + (sourceX + x)) * 4
          const tileIdx = (y * config.tileSize + x) * 4

          if (sourceIdx >= 0 && sourceIdx < faceImageData.data.length - 3) {
            tileData.data[tileIdx] = faceImageData.data[sourceIdx]
            tileData.data[tileIdx + 1] = faceImageData.data[sourceIdx + 1]
            tileData.data[tileIdx + 2] = faceImageData.data[sourceIdx + 2]
            tileData.data[tileIdx + 3] = faceImageData.data[sourceIdx + 3]
          }
        }
      }

      ctx.putImageData(tileData, 0, 0)

      let blob: Blob
      try {
        blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 1.0 })
      } catch (error) {
        console.error("[v0] Error converting canvas to blob:", error)
        // Fallback: try with lower quality
        blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 })
      }

      return Buffer.from(await blob.arrayBuffer())
    } catch (error) {
      console.error("[v0] Error creating tile:", error)
      throw error
    }
  }

  private faceUVToEquirectangular(face: number, u: number, v: number): [number, number] {
    let x: number, y: number, z: number

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

    const getPixel = (px: number, py: number): [number, number, number] => {
      const idx = (py * width + px) * 4
      return [imgData.data[idx], imgData.data[idx + 1], imgData.data[idx + 2]]
    }

    const p11 = getPixel(x1, y1)
    const p21 = getPixel(x2, y1)
    const p12 = getPixel(x1, y2)
    const p22 = getPixel(x2, y2)

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

  private async createZipFile(tiles: { [key: string]: Buffer }): Promise<Buffer> {
    try {
      const zip = new JSZip()

      for (const [tilePath, buffer] of Object.entries(tiles)) {
        zip.file(`${tilePath}.jpg`, buffer)
      }

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

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })
      return zipBuffer
    } catch (error) {
      console.error("[v0] Error creating ZIP file:", error)
      throw error
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] API endpoint called")

    let body
    try {
      body = await request.json()
    } catch (error) {
      console.error("[v0] Error parsing request body:", error)
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
    }

    const { imageUrl } = body

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 })
    }

    try {
      new URL(imageUrl)
    } catch (error) {
      console.error("[v0] Invalid URL format:", imageUrl)
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    console.log("[v0] Starting conversion process...")
    const converter = new ServerPanoramaConverter()
    const result = await converter.convertFromUrl(imageUrl)

    console.log("[v0] Conversion successful, returning ZIP file")
    return new NextResponse(result.zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="cubemap-tiles.zip"',
        "X-Total-Tiles": result.totalTiles.toString(),
        "X-Zoom-Levels": result.zoomLevels.toString(),
        "X-Max-Zoom": result.maxZoom.toString(),
      },
    })
  } catch (error) {
    console.error("[v0] Conversion error:", error)

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    return NextResponse.json(
      {
        error: "Failed to convert panorama image",
        details: errorMessage,
      },
      { status: 500 },
    )
  }
}
