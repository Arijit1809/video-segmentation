import { useEffect, useRef, useState } from 'react'
import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'
import './App.scss'

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)  // For the mask overlay
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)   // For the segmented output
  const [segmenter, setSegmenter] = useState<ImageSegmenter | null>(null)
  const [hasPermission, setHasPermission] = useState(false)

  // Initialize the ImageSegmenter
  useEffect(() => {
    const initializeSegmenter = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      )
      const imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false
      })
      setSegmenter(imageSegmenter)
    }
    initializeSegmenter()
  }, [])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setHasPermission(true)
      }
    } catch (error) {
      console.error('Error accessing camera:', error)
      setHasPermission(false)
    }
  }

  const processFrame = () => {
    if (!videoRef.current || !overlayCanvasRef.current || !outputCanvasRef.current || !segmenter || !hasPermission) return

    const overlayCtx = overlayCanvasRef.current.getContext('2d', { willReadFrequently: true })
    const outputCtx = outputCanvasRef.current.getContext('2d', { willReadFrequently: true })
    if (!overlayCtx || !outputCtx) return

    // Set canvas sizes to match video
    const width = videoRef.current.videoWidth
    const height = videoRef.current.videoHeight
    overlayCanvasRef.current.width = width
    overlayCanvasRef.current.height = height
    outputCanvasRef.current.width = width
    outputCanvasRef.current.height = height

    // Draw original video frame to both canvases
    overlayCtx.drawImage(videoRef.current, 0, 0)
    outputCtx.drawImage(videoRef.current, 0, 0)

    try {
      // Process frame with MediaPipe
      const segmentation = segmenter.segmentForVideo(videoRef.current, performance.now())
      const mask = segmentation.categoryMask?.getAsFloat32Array()
      if (segmentation) {
        // Process overlay canvas (red mask)
        // processSegmentationResults(segmentation, overlayCtx, width, height)

        // Process output canvas (transparent background)
        if (!mask) return
        const outputImageData = outputCtx.getImageData(0, 0, width, height)
        const outputPixels = outputImageData.data

        for (let i = 0; i < mask.length; i++) {
          const pixelIndex = i * 4
          if (mask[i] < 0.052) {  // Background
            outputPixels[pixelIndex] = 255     // Red (R)
            outputPixels[pixelIndex + 1] = 0   // Green (G)
            outputPixels[pixelIndex + 2] = 0   // Blue (B)
            outputPixels[pixelIndex + 3] = 0 // Alpha (semi-transparent)
          }
        }
        outputCtx.putImageData(outputImageData, 0, 0)

        // Clean up resources
        segmentation.close()
      }
    } catch (error) {
      console.error('Error processing frame:', error)
    }


    requestAnimationFrame(processFrame)
  }

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      if (segmenter) {
        segmenter.close()
      }
    }
  }, [segmenter])

  const toggleProcessing = () => {
    processFrame()
  }

  return (
    <div className='min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4'>
      <div className='space-y-4 text-center'>
        <button
          onClick={startCamera}
          disabled={hasPermission}
          className='px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {hasPermission ? 'Camera Access Granted' : 'Allow Camera Access'}
        </button>

        {hasPermission && (
          <button
            onClick={toggleProcessing}
            className='px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700'
          >
            Start Processing
          </button>
        )}
      </div>

      <div className='mt-8 flex gap-4'>
        {/* Original Video with Overlay */}
        <div className='relative w-[640px] h-[480px] rounded-lg overflow-hidden bg-black/20'>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className='absolute w-full h-full object-contain'
          />
          <canvas
            ref={overlayCanvasRef}
            className='absolute w-full h-full object-contain'
          />
        </div>

        {/* Processed Output */}
        <div className='relative w-[640px] h-[480px] rounded-lg overflow-hidden bg-red-500'>
          <canvas
            ref={outputCanvasRef}
            className='absolute w-full h-full object-contain'
          >
          </canvas>
        </div>
      </div>
    </div>
  )
}

export default App