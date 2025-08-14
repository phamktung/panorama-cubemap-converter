"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Upload, Download, Eye } from "lucide-react"
import { PanoramaConverter } from "@/components/panorama-converter"
import { MarzipanoViewer } from "@/components/marzipano-viewer"

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [cubemapData, setCubemapData] = useState<any>(null)
  const [showViewer, setShowViewer] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file)
      setCubemapData(null)
      setShowViewer(false)
    }
  }

  const handleConvert = async () => {
    if (!selectedFile) return

    setIsConverting(true)
    setProgress(0)

    try {
      const converter = new PanoramaConverter()
      const result = await converter.convertToCubemap(selectedFile, (progress) => {
        setProgress(progress)
      })

      setCubemapData(result)
      setProgress(100)
    } catch (error) {
      console.error("Conversion failed:", error)
    } finally {
      setIsConverting(false)
    }
  }

  const handleDownload = () => {
    if (!cubemapData) return

    // Create and download zip file with all tiles
    const link = document.createElement("a")
    link.href = cubemapData.zipUrl
    link.download = "marzipano-cubemap.zip"
    link.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Panorama to Cubemap Converter</h1>
          <p className="text-lg text-gray-600">Convert 360° panoramic images to Marzipano cubemap format</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Panorama Image
            </CardTitle>
            <CardDescription>
              Select an equirectangular panoramic image to convert to Marzipano cubemap tiles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">Selected file:</div>
                  <div className="font-medium">{selectedFile.name}</div>
                  <div className="text-sm text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                  <div className="text-gray-600">Click to select a panoramic image</div>
                </div>
              )}
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="mt-4">
                {selectedFile ? "Change Image" : "Select Image"}
              </Button>
            </div>

            {selectedFile && (
              <div className="flex gap-2">
                <Button onClick={handleConvert} disabled={isConverting} className="flex-1">
                  {isConverting ? "Converting..." : "Convert to Cubemap"}
                </Button>
              </div>
            )}

            {isConverting && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Converting...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {cubemapData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Conversion Complete
              </CardTitle>
              <CardDescription>Your panorama has been converted to Marzipano cubemap format</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium">Total Tiles:</div>
                  <div className="text-gray-600">{cubemapData.totalTiles}</div>
                </div>
                <div>
                  <div className="font-medium">Zoom Levels:</div>
                  <div className="text-gray-600">{cubemapData.zoomLevels}</div>
                </div>
                <div>
                  <div className="font-medium">Tile Size:</div>
                  <div className="text-gray-600">512x512 pixels</div>
                </div>
                <div>
                  <div className="font-medium">Format:</div>
                  <div className="text-gray-600">{"{z}/{f}/{y}/{x}.jpg"}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  Download Cubemap
                </Button>
                <Button onClick={() => setShowViewer(!showViewer)} variant="outline" className="flex-1">
                  <Eye className="w-4 h-4 mr-2" />
                  {showViewer ? "Hide Preview" : "Preview"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showViewer && cubemapData && (
          <Card>
            <CardHeader>
              <CardTitle>Marzipano Preview</CardTitle>
              <CardDescription>Interactive preview of your converted cubemap</CardDescription>
            </CardHeader>
            <CardContent>
              <MarzipanoViewer cubemapData={cubemapData} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
