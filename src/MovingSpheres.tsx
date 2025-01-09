import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"

export const MovingSpheres = ({ count, z, color, opacity }: { count: number, z: number, color: string, opacity: number }) => {
	const positions = useMemo(() => {
		const temp = new Float32Array(count * 3)
		for (let i = 0; i < count; i++) {
			temp[i * 3] = (Math.random() - 0.5) * 14     // x
			temp[i * 3 + 1] = (Math.random() - 0.5) * 8  // y
			temp[i * 3 + 2] = z                          // z
		}
		return temp
	}, [count, z])

	const speeds = useMemo(() =>
		Array(count).fill(0).map(() => ({
			x: (Math.random() - 0.5) * 0.06,
			y: (Math.random() - 0.5) * 0.06
		})),
		[count])

	const instancedMeshRef = useRef<THREE.InstancedMesh>(null!)

	useEffect(() => {
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
	}, [count])

	useFrame(() => {
		const matrix = new THREE.Matrix4()
		for (let i = 0; i < count; i++) {
			positions[i * 3] += speeds[i].x
			positions[i * 3 + 1] += speeds[i].y

			if (Math.abs(positions[i * 3]) > 14) speeds[i].x *= -1
			if (Math.abs(positions[i * 3 + 1]) > 8) speeds[i].y *= -1

			matrix.setPosition(
				positions[i * 3],
				positions[i * 3 + 1],
				positions[i * 3 + 2]
			)
			instancedMeshRef.current.setMatrixAt(i, matrix)
		}
		instancedMeshRef.current.instanceMatrix.needsUpdate = true
	})

	return (
		<instancedMesh
			ref={instancedMeshRef}
			args={[
				new THREE.SphereGeometry(0.3),
				new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
				count
			]}
		/>
	)
}