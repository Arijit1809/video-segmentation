import { useEffect, useRef, useState } from 'react'
import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import './App.scss'
import { OrbitControls } from '@react-three/drei'

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)
  const outputBgRef = useRef<HTMLCanvasElement>(null)
  // const textureRef = useRef<THREE.CanvasTexture | null>(null)
  const [segmenter, setSegmenter] = useState<ImageSegmenter | null>(null)
  const [hasPermission, setHasPermission] = useState(false)

  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null)
  const [canvasBgTexture, setCanvasBgTexture] = useState<THREE.CanvasTexture | null>(null)
  // Initialize the ImageSegmenter
  useEffect(() => {
    const initializeSegmenter = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      )
      const imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/selfie_segmenter_landscape.tflite",  // Using local file from public folder
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

  // Update texture every frame
  const Scene = () => {
    useFrame(() => {
      if (canvasTexture && canvasBgTexture) {
        canvasTexture.needsUpdate = true
        canvasBgTexture.needsUpdate = true
      }
    })

    return (
      <>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[16, 9]} />
          <meshBasicMaterial side={THREE.DoubleSide} map={canvasTexture || undefined} transparent />
        </mesh>
        <mesh position={[0, 0, -1.3]}>
          <planeGeometry args={[16, 9]} />
          <meshBasicMaterial side={THREE.DoubleSide} map={canvasBgTexture || undefined} transparent opacity={1} />
        </mesh>

        {/* <MovingSpheres count={100} z={-1} color="red" opacity={1} /> */}
        {/* <MovingSpheres count={100} z={1} color="green" opacity={0.5} /> */}
      </>
    )
  }

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
    if (!videoRef.current || !outputCanvasRef.current || !outputBgRef.current || !segmenter || !hasPermission) return

    const outputCtx = outputCanvasRef.current.getContext('2d', { willReadFrequently: true })
    const outputBgCtx = outputBgRef.current.getContext('2d', { willReadFrequently: true })
    if (!outputCtx || !outputBgCtx) return

    // Set canvas sizes to match video
    const width = videoRef.current.videoWidth
    const height = videoRef.current.videoHeight
    outputCanvasRef.current.width = width
    outputCanvasRef.current.height = height
    outputBgRef.current.width = width
    outputBgRef.current.height = height

    // Draw original video frame to both canvases
    outputCtx.drawImage(videoRef.current, 0, 0)
    outputBgCtx.drawImage(videoRef.current, 0, 0)
    try {
      // Process frame with MediaPipe
      const segmentation = segmenter.segmentForVideo(videoRef.current, performance.now())
      const mask = segmentation.categoryMask?.getAsFloat32Array()
      if (segmentation) {

        // Process output canvas (transparent background)
        if (!mask) return
        const outputImageData = outputCtx.getImageData(0, 0, width, height)
        const outputBgImageData = outputBgCtx.getImageData(0, 0, width, height)
        const outputPixels = outputImageData.data
        const outputBgPixels = outputBgImageData.data

        for (let i = 0; i < mask.length; i++) {
          const pixelIndex = i * 4
          if (mask[i] > 0) {  // Background
            outputPixels[pixelIndex] = 255     // Red (R)
            outputPixels[pixelIndex + 1] = 0   // Green (G)
            outputPixels[pixelIndex + 2] = 0   // Blue (B)
            outputPixels[pixelIndex + 3] = 0 // Alpha (semi-transparent)
          }
        }
        for (let i = 0; i < mask.length; i++) {
          const pixelIndex = i * 4
          if (mask[i] === 0) {  // Background
            outputBgPixels[pixelIndex] = 255     // Red (R)
            outputBgPixels[pixelIndex + 1] = 0   // Green (G)
            outputBgPixels[pixelIndex + 2] = 0   // Blue (B)
            outputBgPixels[pixelIndex + 3] = 0 // Alpha (semi-transparent)
          }
        }
        outputCtx.putImageData(outputImageData, 0, 0)
        outputBgCtx.putImageData(outputBgImageData, 0, 0)
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
    if (outputCanvasRef.current && outputBgRef.current) {
      const tex = new THREE.CanvasTexture(outputCanvasRef.current)
      const bgTex = new THREE.CanvasTexture(outputBgRef.current)
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.format = THREE.RGBAFormat
      tex.needsUpdate = true
      setCanvasTexture(tex)
      bgTex.minFilter = THREE.LinearFilter
      bgTex.magFilter = THREE.LinearFilter
      bgTex.format = THREE.RGBAFormat
      bgTex.needsUpdate = true
      setCanvasBgTexture(bgTex)
      processFrame()
    }
  }

  return (
    <div className='min-h-screen bg-gray-900 flex flex-col items-center justify-center'>
      <div className=' text-center'>
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

      <div className='flex gap-4'>
        {/* Original Video with Overlay */}
        <div className={`relative w-[480px] h-[270px] rounded-lg overflow-hidden bg-black/20`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className='absolute w-full h-full object-contain'
          />
        </div>

        {/* Processed Output */}
        <div className={`relative w-[480px] h-[270px] rounded-lg overflow-hidden bg-red-500`}>
          <canvas
            ref={outputCanvasRef}
            className='absolute w-full h-full object-contain invisible'
          />
          <canvas
            ref={outputBgRef}
            className='absolute w-full h-full object-contain'
          />
        </div>
      </div>

      {/* R3F Canvas */}
      <div className={`mt-4 w-[480px] h-[270px] rounded-lg overflow-hidden`}>
        <Canvas
          orthographic
          camera={{ zoom: 30, position: [0, 0, 2] }}
        >
          <OrbitControls />
          <ambientLight intensity={10} />
          <Scene />
        </Canvas>
      </div>
    </div>
  )
}

export default App
