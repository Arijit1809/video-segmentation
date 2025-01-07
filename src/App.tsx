import { useEffect, useRef, useState, useMemo } from 'react'
import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import './App.scss'
import { OrbitControls } from '@react-three/drei'

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)
  // const textureRef = useRef<THREE.CanvasTexture | null>(null)
  const [segmenter, setSegmenter] = useState<ImageSegmenter | null>(null)
  const [hasPermission, setHasPermission] = useState(false)

  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null)

  const masterFactor = 2

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
    // Create initial positions and speeds
    const count = 50
    const positions = useMemo(() => {
      const temp = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        temp[i * 3] = (Math.random() - 0.5) * 4     // x
        temp[i * 3 + 1] = (Math.random() - 0.5) * 4 // y
        temp[i * 3 + 2] = Math.random() < 0.5 ? -2 : 2 // z
      }
      return temp
    }, [])

    const speeds = useMemo(() =>
      Array(count).fill(0).map(() => ({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02
      })),
      [])

    useEffect(() => {
      // Set initial positions for each instance
      const matrix = new THREE.Matrix4()

      for (let i = 0; i < count; i++) {
        matrix.setPosition(
          positions[i * 3],
          positions[i * 3 + 1],
          positions[i * 3 + 2]
        )
        instancedMeshRef.current.setMatrixAt(i, matrix)
      }
      instancedMeshRef.current.instanceMatrix.needsUpdate = true
    }, [])

    useFrame(() => {
      if (canvasTexture) {
        canvasTexture.needsUpdate = true
      }

      // Update positions
      const matrix = new THREE.Matrix4()
      for (let i = 0; i < count; i++) {
        positions[i * 3] += speeds[i].x
        positions[i * 3 + 1] += speeds[i].y

        // Bounce off boundaries
        if (Math.abs(positions[i * 3]) > 2) speeds[i].x *= -1
        if (Math.abs(positions[i * 3 + 1]) > 2) speeds[i].y *= -1

        matrix.setPosition(
          positions[i * 3],
          positions[i * 3 + 1],
          positions[i * 3 + 2]
        )
        instancedMeshRef.current.setMatrixAt(i, matrix)
      }
      instancedMeshRef.current.instanceMatrix.needsUpdate = true
    })

    const instancedMeshRef = useRef<THREE.InstancedMesh>(null!)
    const factor = 0.9

    return (
      <>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[16 * factor, 9 * factor]} />
          <meshBasicMaterial side={THREE.DoubleSide} color="white" map={canvasTexture || undefined} transparent />
        </mesh>

        <instancedMesh ref={instancedMeshRef} args={[new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: 'red' }), count]}>
        </instancedMesh>
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
          if (mask[i] > 0) {  // Background
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
    if (outputCanvasRef.current) {
      const tex = new THREE.CanvasTexture(outputCanvasRef.current)
      setCanvasTexture(tex)
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
          <canvas
            ref={overlayCanvasRef}
            className='absolute w-full h-full object-contain'
          />
        </div>

        {/* Processed Output */}
        <div className={`relative w-[480px] h-[270px] rounded-lg overflow-hidden bg-red-500`}>
          <canvas
            ref={outputCanvasRef}
            className='absolute w-full h-full object-contain'
          />
        </div>
      </div>

      {/* R3F Canvas */}
      <div className={`mt-4 w-[480px] h-[270px] rounded-lg overflow-hidden`}>
        <Canvas>
          <OrbitControls />
          <Scene />
        </Canvas>
      </div>
    </div>
  )
}

export default App