"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Download, Link, Loader2 } from "lucide-react"

export function ApiConverter() {
  const [imageUrl, setImageUrl] = useState("")
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{
    downloadUrl: string
    totalTiles: number
    zoomLevels: number
    maxZoom: number
  } | null>(null)

  const handleConvert = async () => {
    if (!imageUrl.trim()) return

    setIsConverting(true)
    setProgress(0)
    setResult(null)

    try {
      const response = await fetch("/api/convert-panorama", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl: imageUrl.trim() }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Conversion failed")
      }

      const totalTiles = Number.parseInt(response.headers.get("X-Total-Tiles") || "0")
      const zoomLevels = Number.parseInt(response.headers.get("X-Zoom-Levels") || "0")
      const maxZoom = Number.parseInt(response.headers.get("X-Max-Zoom") || "0")

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)

      setResult({
        downloadUrl,
        totalTiles,
        zoomLevels,
        maxZoom,
      })

      setProgress(100)
    } catch (error) {
      console.error("Conversion error:", error)
      alert(error instanceof Error ? error.message : "Conversion failed")
    } finally {
      setIsConverting(false)
    }
  }

  const handleDownload = () => {
    if (result) {
      const link = document.createElement("a")
      link.href = result.downloadUrl
      link.download = "cubemap-tiles.zip"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link className="h-5 w-5" />
          API Panorama Converter
        </CardTitle>
        <CardDescription>Convert panoramic images to Marzipano cubemap format using image URLs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="imageUrl" className="text-sm font-medium">
            Panoramic Image URL
          </label>
          <Input
            id="imageUrl"
            type="url"
            placeholder="https://example.com/panorama.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            disabled={isConverting}
          />
        </div>

        <Button onClick={handleConvert} disabled={!imageUrl.trim() || isConverting} className="w-full">
          {isConverting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Converting...
            </>
          ) : (
            "Convert to Cubemap"
          )}
        </Button>

        {isConverting && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Processing...</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {result && (
          <div className="space-y-4 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-green-800">Conversion Complete!</h3>
                <p className="text-sm text-green-600">
                  Generated {result.totalTiles} tiles across {result.zoomLevels} zoom levels
                </p>
              </div>
              <Button onClick={handleDownload} size="sm">
                <Download className="mr-2 h-4 w-4" />
                Download ZIP
              </Button>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 space-y-1">
          <p>
            <strong>Supported formats:</strong> JPG, PNG, WebP
          </p>
          <p>
            <strong>Output structure:</strong> {`{z}/{f}/{y}/{x}.jpg`} where f = r,l,u,d,f,b
          </p>
          <p>
            <strong>Quality:</strong> Maximum quality preservation with bilinear interpolation
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
