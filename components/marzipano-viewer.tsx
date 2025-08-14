"use client"

import { useEffect, useRef } from "react"

interface MarzipanoViewerProps {
  cubemapData: any
}

export function MarzipanoViewer({ cubemapData }: MarzipanoViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!viewerRef.current || !cubemapData) return

    // Create a simple preview using the center tiles
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 512
    canvas.style.width = "100%"
    canvas.style.height = "400px"
    canvas.style.objectFit = "cover"
    canvas.style.borderRadius = "8px"

    const ctx = canvas.getContext("2d")!

    // Draw a preview using the front face center tile
    const frontTileKey = `${Math.floor(cubemapData.maxZoom / 2)}/4/0/0`
    const tileData = cubemapData.tiles[frontTileKey]

    if (tileData) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 512, 512)

        // Add overlay text
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
        ctx.fillRect(0, 0, 512, 60)
        ctx.fillStyle = "white"
        ctx.font = "16px sans-serif"
        ctx.fillText("Cubemap Preview (Front Face)", 10, 30)
        ctx.font = "12px sans-serif"
        ctx.fillText(`Zoom Level: ${Math.floor(cubemapData.maxZoom / 2)} | Face: 4 (Front)`, 10, 50)
      }
      img.src = tileData
    }

    viewerRef.current.innerHTML = ""
    viewerRef.current.appendChild(canvas)

    return () => {
      if (viewerRef.current) {
        viewerRef.current.innerHTML = ""
      }
    }
  }, [cubemapData])

  return (
    <div className="space-y-4">
      <div ref={viewerRef} className="bg-gray-100 rounded-lg min-h-[400px] flex items-center justify-center">
        <div className="text-gray-500">Loading preview...</div>
      </div>
      <div className="text-sm text-gray-600">
        <p>
          <strong>Note:</strong> This is a simplified preview showing the front face of your cubemap.
        </p>
        <p>Download the full cubemap to use with Marzipano viewer for complete 360° navigation.</p>
      </div>
    </div>
  )
}
